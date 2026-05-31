import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * AgentNetwork — a WebGL hero scene for the ClawChain landing page.
 *
 * Renders a slowly rotating 3D graph of "agent" nodes connected by glowing
 * edges, with bright "task" pulses traveling between agents — the visual
 * metaphor for the AI agent economy. Brand palette: indigo -> purple -> cyan.
 *
 * The scene is purely decorative: pointer-events are disabled so it never
 * intercepts clicks, it pauses when scrolled offscreen, and it honors
 * prefers-reduced-motion by rendering a single static frame.
 */

const BRAND = [
  new THREE.Color('#6366f1'), // indigo
  new THREE.Color('#a855f7'), // purple
  new THREE.Color('#06b6d4'), // cyan
]

// Color sampled along the indigo -> purple -> cyan gradient (t in [0,1]).
function brandColor(t: number, out: THREE.Color): THREE.Color {
  const clamped = Math.min(0.999, Math.max(0, t))
  const seg = clamped * (BRAND.length - 1)
  const i = Math.floor(seg)
  return out.copy(BRAND[i]).lerp(BRAND[i + 1], seg - i)
}

// Distribute N points evenly on a sphere (Fibonacci spiral).
function fibonacciSphere(n: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius))
  }
  return pts
}

// Connect each node to its k nearest neighbors, de-duplicating edges.
function nearestNeighborEdges(points: THREE.Vector3[], k: number): Array<[number, number]> {
  const seen = new Set<string>()
  const edges: Array<[number, number]> = []
  for (let i = 0; i < points.length; i++) {
    const ranked = points
      .map((p, j) => ({ j, d: points[i].distanceToSquared(p) }))
      .filter((o) => o.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
    for (const { j } of ranked) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([i, j])
      }
    }
  }
  return edges
}

// Build a soft radial-gradient sprite used to make points glow additively.
function makeGlowTexture(softness: number): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(softness, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface GraphProps {
  nodeCount: number
  reducedMotion: boolean
}

function Graph({ nodeCount, reducedMotion }: GraphProps) {
  const spin = useRef<THREE.Group>(null)
  const parallax = useRef<THREE.Group>(null)
  const pulsePoints = useRef<THREE.Points>(null)
  const haloMat = useRef<THREE.PointsMaterial>(null)

  const glowTex = useMemo(() => makeGlowTexture(0.25), [])
  const coreTex = useMemo(() => makeGlowTexture(0.7), [])
  useEffect(() => () => { glowTex.dispose(); coreTex.dispose() }, [glowTex, coreTex])

  // Static graph data: node positions/colors, edge geometry, task-pulse tracks.
  const data = useMemo(() => {
    const radius = 2.6
    const points = fibonacciSphere(nodeCount, radius)
    const edges = nearestNeighborEdges(points, 3)

    const nodePos = new Float32Array(points.length * 3)
    const nodeCol = new Float32Array(points.length * 3)
    const tmp = new THREE.Color()
    points.forEach((p, i) => {
      nodePos.set([p.x, p.y, p.z], i * 3)
      brandColor((p.y / radius + 1) / 2, tmp)
      nodeCol.set([tmp.r, tmp.g, tmp.b], i * 3)
    })

    const edgePos = new Float32Array(edges.length * 2 * 3)
    const edgeCol = new Float32Array(edges.length * 2 * 3)
    edges.forEach(([a, b], e) => {
      const pa = points[a]
      const pb = points[b]
      edgePos.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], e * 6)
      brandColor((pa.y / radius + 1) / 2, tmp)
      edgeCol.set([tmp.r, tmp.g, tmp.b], e * 6)
      brandColor((pb.y / radius + 1) / 2, tmp)
      edgeCol.set([tmp.r, tmp.g, tmp.b], e * 6 + 3)
    })

    // Pick a handful of edges to carry "task" pulses.
    const pulseCount = Math.min(edges.length, Math.max(6, Math.round(nodeCount / 3)))
    const tracks = Array.from({ length: pulseCount }, (_, i) => {
      const [a, b] = edges[(i * 7) % edges.length]
      return { a: points[a], b: points[b], phase: (i / pulseCount) }
    })
    const pulsePos = new Float32Array(pulseCount * 3)
    tracks.forEach((tk, i) => pulsePos.set([tk.a.x, tk.a.y, tk.a.z], i * 3))

    return { points, edges, nodePos, nodeCol, edgePos, edgeCol, tracks, pulsePos }
  }, [nodeCount])

  const { pointer } = useThree()

  useFrame((state) => {
    const t = state.clock.elapsedTime

    if (spin.current) {
      spin.current.rotation.y = reducedMotion ? 0.6 : t * 0.045
      spin.current.rotation.x = reducedMotion ? 0.18 : Math.sin(t * 0.12) * 0.1
    }
    // Gentle pointer parallax (lerped) layered on top of the continuous spin.
    if (parallax.current && !reducedMotion) {
      const tx = pointer.y * 0.18
      const ty = pointer.x * 0.28
      parallax.current.rotation.x += (tx - parallax.current.rotation.x) * 0.04
      parallax.current.rotation.y += (ty - parallax.current.rotation.y) * 0.04
    }
    if (haloMat.current) {
      haloMat.current.opacity = reducedMotion ? 0.55 : 0.45 + Math.sin(t * 1.6) * 0.12
    }

    // Advance task pulses along their edges.
    if (!reducedMotion && pulsePoints.current) {
      const attr = pulsePoints.current.geometry.getAttribute('position') as THREE.BufferAttribute
      data.tracks.forEach((tk, i) => {
        const raw = (t * 0.22 + tk.phase) % 1
        const e = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2 // ease in-out
        attr.setXYZ(
          i,
          tk.a.x + (tk.b.x - tk.a.x) * e,
          tk.a.y + (tk.b.y - tk.a.y) * e,
          tk.a.z + (tk.b.z - tk.a.z) * e,
        )
      })
      attr.needsUpdate = true
    }
  })

  return (
    <group ref={parallax}>
      <group ref={spin}>
        {/* Edges — additive glowing connections */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[data.edgePos, 3]} />
            <bufferAttribute attach="attributes-color" args={[data.edgeCol, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.22}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>

        {/* Node halos — soft additive glow */}
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[data.nodePos, 3]} />
            <bufferAttribute attach="attributes-color" args={[data.nodeCol, 3]} />
          </bufferGeometry>
          <pointsMaterial
            ref={haloMat}
            map={glowTex}
            size={0.62}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>

        {/* Node cores — bright centers */}
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[data.nodePos, 3]} />
            <bufferAttribute attach="attributes-color" args={[data.nodeCol, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={coreTex}
            size={0.18}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>

        {/* Task pulses — bright points traveling between agents */}
        <points ref={pulsePoints}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[data.pulsePos, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={coreTex}
            color="#a5f3fc"
            size={0.26}
            sizeAttenuation
            transparent
            opacity={0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      </group>
    </group>
  )
}

// Probe for a usable WebGL context. Returns false on headless/sandboxed
// renderers or browsers without WebGL, so we can fall back to the CSS backdrop
// instead of mounting a renderer that errors out.
function hasWebGL(): boolean {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return true
  } catch {
    return false
  }
}

export default function AgentNetwork() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [nodeCount, setNodeCount] = useState(48)
  const [webgl, setWebgl] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => { setWebgl(hasWebGL()) }, [])

  // Honor reduced-motion and scale node count to viewport width.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)

    const sizeCount = () => setNodeCount(window.innerWidth < 768 ? 26 : 48)
    sizeCount()
    window.addEventListener('resize', sizeCount)
    return () => {
      mq.removeEventListener('change', apply)
      window.removeEventListener('resize', sizeCount)
    }
  }, [])

  // Pause rendering when the hero is scrolled out of view.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {
      threshold: 0.01,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // No WebGL (or it errored at runtime): render nothing and let the CSS
  // orbs/grid backdrop stand in. The scene is purely decorative.
  if (!webgl || failed) return null

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
        frameloop={active && !reducedMotion ? 'always' : 'demand'}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', () => setFailed(true), { once: true })
        }}
      >
        <fog attach="fog" args={['#09090b', 6, 12]} />
        <Graph nodeCount={nodeCount} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
