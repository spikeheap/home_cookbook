import build from "./config/esbuild.defaults.js"

// You can customize this as you wish, perhaps to add new esbuild plugins.
//
// ```
// import { copy } from 'esbuild-plugin-copy'
// 
// const esbuildOptions = {
//   plugins: [
//     copy({
//       resolveFrom: 'cwd',
//       assets: {
//         from: ['./node_modules/somepackage/files/*')],
//         to: ['./output/_bridgetown/somepackage/files')],
//       },
//       verbose: false
//     }),
//   ]
// }
// ```
//
// You can also support custom base_path deployments via changing `publicPath`.
//
// ```
// const esbuildOptions = {
//   publicPath: "/my_subfolder/_bridgetown/static",
//   ...
// }
// ```

/**
 * @typedef { import("esbuild").BuildOptions } BuildOptions
 * @type {BuildOptions}
 */
const esbuildOptions = {
  // Enable code-splitting so dynamic `import()` calls land in their own chunks,
  // loaded only when needed. Keeps the ~85 KB OFF ingredient dictionary out of
  // the bundle that runs on every page — it's pulled in lazily when the plan
  // page calls into aggregator.js.
  splitting: true,
  format: "esm",
  plugins: [
    // add new plugins here...
  ],
  globOptions: {
    excludeFilter: /\.(dsd|lit)\.css$/
  }
}

build(esbuildOptions)
