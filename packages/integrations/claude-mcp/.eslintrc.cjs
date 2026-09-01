/** @type {import("eslint").Linter.Config} */
module.exports = {
    root: true,
    ignorePatterns: [".eslintrc.cjs", "dist", "test"],
    extends: ["@opendaw/eslint-config/index.js"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: true,
    },
};
