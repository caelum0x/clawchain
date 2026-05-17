const path = require("path");

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          typeRoots: [
            path.resolve(__dirname, "../../node_modules/@types"),
            path.resolve(__dirname, "./node_modules/@types"),
          ],
          types: ["jest"],
        },
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleNameMapper: {
    "^(.*)\\.js$": "$1",
    "^react-native$": "<rootDir>/src/__mocks__/react-native.ts",
  },
};
