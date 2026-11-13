module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: { module: "CommonJS", target: "ES2020" } }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
};
