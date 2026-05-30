module.exports = {
  // if the app is supposed to run on Github Pages in a subfolder, use the following config:
  // publicPath: process.env.NODE_ENV === "production" ? "/mytownsquare/" : "/" //github config
  // publicPath: process.env.NODE_ENV === "production" ? "/" : "/", // other config
  pages: {
    index: {
      entry: "src/main.js",
      template: "public/index.html",
      filename: "index.html",
      chunks: ["chunk-vendors", "chunk-common", "index"],
    },
  },
  productionSourceMap: false,
  configureWebpack: {
    performance: {
      hints: false,
      maxAssetSize: 1400 * 1024,
      maxEntrypointSize: 2200 * 1024,
    },
  },
};
