/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    // Redirige tous les imports .js vers leur équivalent sans extension
    // Jest trouvera automatiquement le .ts correspondant
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: {
        // Jest nécessite CommonJS ; on surcharge sans toucher tsconfig.json
        module: "commonjs",
        moduleResolution: "node",
        verbatimModuleSyntax: false,
        types: ["node", "jest"],
        ignoreDeprecations: "6.0",
      },
    }],
  },
};
