import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { ToastProvider } from "./hooks/useToast.tsx";
import ToastContainer from "./components/ToastContainer.tsx";
import Home from "./pages/Home.tsx";

const Explorer = lazy(() => import("./pages/Explorer.tsx"));
const BlockDetail = lazy(() => import("./pages/BlockDetail.tsx"));
const TxDetail = lazy(() => import("./pages/TxDetail.tsx"));
const AccountDetail = lazy(() => import("./pages/AccountDetail.tsx"));
const Wallet = lazy(() => import("./pages/Wallet.tsx"));
const Faucet = lazy(() => import("./pages/Faucet.tsx"));
const Marketplace = lazy(() => import("./pages/Marketplace.tsx"));
const Validators = lazy(() => import("./pages/Validators.tsx"));
const ValidatorDetail = lazy(() => import("./pages/ValidatorDetail.tsx"));
const Agents = lazy(() => import("./pages/Agents.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const Governance = lazy(() => import("./pages/Governance.tsx"));
const ProposalDetail = lazy(() => import("./pages/ProposalDetail.tsx"));
const Staking = lazy(() => import("./pages/Staking.tsx"));
const StakingCalculator = lazy(() => import("./pages/StakingCalculator.tsx"));
const Tasks = lazy(() => import("./pages/Tasks.tsx"));
const Models = lazy(() => import("./pages/Models.tsx"));
const Inference = lazy(() => import("./pages/Inference.tsx"));
const Messaging = lazy(() => import("./pages/Messaging.tsx"));
const GPUCompute = lazy(() => import("./pages/GPUCompute.tsx"));
const Reputation = lazy(() => import("./pages/Reputation.tsx"));
const NetworkHealth = lazy(() => import("./pages/NetworkHealth.tsx"));
const NetworkStats = lazy(() => import("./pages/NetworkStats.tsx"));
const Escrows = lazy(() => import("./pages/Escrows.tsx"));
const IBC = lazy(() => import("./pages/IBC.tsx"));
const Analytics = lazy(() => import("./pages/Analytics.tsx"));
const TokenEconomics = lazy(() => import("./pages/TokenEconomics.tsx"));
const ApiDocs = lazy(() => import("./pages/ApiDocs.tsx"));
const AddressBook = lazy(() => import("./pages/AddressBook.tsx"));
const Swap = lazy(() => import("./pages/Swap.tsx"));
const Contracts = lazy(() => import("./pages/Contracts.tsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.tsx"));
const ProviderDashboard = lazy(() => import("./pages/ProviderDashboard.tsx"));
const ProviderOnboarding = lazy(() => import("./pages/ProviderOnboarding.tsx"));
const Leaderboard = lazy(() => import("./pages/Leaderboard.tsx"));
const GPUProviders = lazy(() => import("./pages/GPUProviders.tsx"));
const Bridge = lazy(() => import("./pages/Bridge.tsx"));
const Operations = lazy(() => import("./pages/Operations.tsx"));
const Oracle = lazy(() => import("./pages/Oracle.tsx"));
const ValidatorOracle = lazy(() => import("./pages/ValidatorOracle.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function PageLoader() {
  return (
    <div className="loading" role="status" aria-label="Loading page">
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/explorer/block/:height" element={<BlockDetail />} />
            <Route path="/explorer/tx/:hash" element={<TxDetail />} />
            <Route path="/explorer/account/:address" element={<AccountDetail />} />
            <Route path="/validators" element={<Validators />} />
            <Route path="/validators/:address" element={<ValidatorDetail />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/faucet" element={<Faucet />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/escrows" element={<Escrows />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<Tasks />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/governance/:id" element={<ProposalDetail />} />
            <Route path="/staking" element={<Staking />} />
            <Route path="/staking/calculator" element={<StakingCalculator />} />
            <Route path="/models" element={<Models />} />
            <Route path="/inference" element={<Inference />} />
            <Route path="/messaging" element={<Messaging />} />
            <Route path="/gpu" element={<GPUCompute />} />
            <Route path="/reputation" element={<Reputation />} />
            <Route path="/network" element={<NetworkStats />} />
            <Route path="/health" element={<NetworkHealth />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/tokenomics" element={<TokenEconomics />} />
            <Route path="/ibc" element={<IBC />} />
            <Route path="/swap" element={<Swap />} />
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/api-docs" element={<ApiDocs />} />
            <Route path="/address-book" element={<AddressBook />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/provider" element={<ProviderDashboard />} />
            <Route path="/provider-onboarding" element={<ProviderOnboarding />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/gpu-providers" element={<GPUProviders />} />
            <Route path="/bridge" element={<Bridge />} />
            <Route path="/oracle" element={<Oracle />} />
            <Route path="/validator-oracle" element={<ValidatorOracle />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
      <ToastContainer />
      </ToastProvider>
    </ErrorBoundary>
  );
}
