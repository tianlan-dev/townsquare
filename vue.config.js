module.exports = {
  // if the app is supposed to run on Github Pages in a subfolder, use the following config:
  // publicPath: process.env.NODE_ENV === "production" ? "/mytownsquare/" : "/" //github config
  // publicPath: process.env.NODE_ENV === "production" ? "/" : "/", // other config
  filenameHashing: false,
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
  chainWebpack: (config) => {
    // Docker copies the large script library without loading it into webpack.
    if (process.env.TOWNSQUARE_EXTERNAL_SCRIPTS === "1") {
      config.plugin("copy").tap((args) => {
        args[0].patterns[0].globOptions.ignore.push("**/scripts/**");
        return args;
      });
    }

    config.module.rule("images").set("generator", {
      filename: "img/[path][name][ext]",
    });
    config.module.rule("svg").set("generator", {
      filename: "img/[path][name][ext]",
    });
    config.module.rule("media").set("generator", {
      filename: "media/[path][name][ext]",
    });
    config.module.rule("fonts").set("generator", {
      filename: "fonts/[path][name][ext]",
    });
  },
};
