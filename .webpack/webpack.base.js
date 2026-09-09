// ~~ ENV
const dotenv = require('dotenv');
//
const path = require('path');
const fs = require('fs');

const webpack = require('webpack');

// ~~ PLUGINS
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const TerserJSPlugin = require('terser-webpack-plugin');

// ~~ PackageJSON
// const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
//   .rules;
// ~~ RULES
// const loadShadersRule = require('./rules/loadShaders.js');
const loadWebWorkersRule = require('./rules/loadWebWorkers.js');
const transpileJavaScriptRule = require('./rules/transpileJavaScript.js');
const cssToJavaScript = require('./rules/cssToJavaScript.js');
// Only uncomment for old v2 stylus
// const stylusToJavaScript = require('./rules/stylusToJavaScript.js');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

// ~~ ENV VARS
const NODE_ENV = process.env.NODE_ENV;
const QUICK_BUILD = process.env.QUICK_BUILD;
const BUILD_NUM = process.env.CIRCLE_BUILD_NUM || '0';

// read from ../version.txt
// Read if present. A fresh clone has neither until the release script writes
// them, and a build that stops because it cannot stamp a version number into a
// banner is a build that stops for no reason.
const readOptional = name => {
  try {
    return fs.readFileSync(path.join(__dirname, '..', name), 'utf8').trim();
  } catch {
    return '';
  }
};

const VERSION_NUMBER = readOptional('version.txt');

/**
 * The revision this build was made from.
 *
 * It used to be a committed file, and therefore stuck at whatever revision somebody
 * wrote into it: either it is updated by hand on every commit, or it lies. Asking git
 * makes it always true. An archive downloaded as a zip has no git, and there the file
 * stands in, if it is there, and otherwise nothing. A banner without a revision is no
 * reason to stop a build.
 */
const commitHash = () => {
  try {
    return require('child_process')
      .execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return readOptional('commit.txt');
  }
};

const COMMIT_HASH = commitHash();

//
dotenv.config();

const defineValues = {
  /* Application */
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  'process.env.NODE_DEBUG': JSON.stringify(process.env.NODE_DEBUG),
  'process.env.DEBUG': JSON.stringify(process.env.DEBUG),
  'process.env.PUBLIC_URL': JSON.stringify(process.env.PUBLIC_URL || '/'),
  'process.env.BUILD_NUM': JSON.stringify(BUILD_NUM),
  'process.env.VERSION_NUMBER': JSON.stringify(VERSION_NUMBER),
  'process.env.COMMIT_HASH': JSON.stringify(COMMIT_HASH),
  /* i18n */
  'process.env.USE_LOCIZE': JSON.stringify(process.env.USE_LOCIZE || ''),
  'process.env.LOCIZE_PROJECTID': JSON.stringify(process.env.LOCIZE_PROJECTID || ''),
  'process.env.LOCIZE_API_KEY': JSON.stringify(process.env.LOCIZE_API_KEY || ''),
  'process.env.REACT_APP_I18N_DEBUG': JSON.stringify(process.env.REACT_APP_I18N_DEBUG || ''),
};

// Only redefine updated values.  This avoids warning messages in the logs
if (!process.env.APP_CONFIG) {
  defineValues['process.env.APP_CONFIG'] = '';
}

module.exports = (env, argv, { SRC_DIR, ENTRY }) => {
  const mode = NODE_ENV === 'production' ? 'production' : 'development';
  const isProdBuild = NODE_ENV === 'production';
  const isQuickBuild = QUICK_BUILD === 'true';

  const config = {
    mode: isProdBuild ? 'production' : 'development',
    devtool: isProdBuild ? 'source-map' : 'cheap-module-source-map',
    entry: ENTRY,
    optimization: {
      // splitChunks: {
      //   // include all types of chunks
      //   chunks: 'all',
      // },
      //runtimeChunk: 'single',
      minimize: isProdBuild,
      sideEffects: false,
    },
    output: {
      // clean: true,
      publicPath: '/',
    },
    context: SRC_DIR,
    stats: {
      colors: true,
      hash: true,
      timings: true,
      assets: true,
      chunks: false,
      chunkModules: false,
      modules: false,
      children: false,
      warnings: true,
    },
    // In development the cache is in memory ONLY: it lives in the dev server's process,
    // writes nothing to disc and disappears when it closes, so it cannot leave stale
    // artefacts between one run and the next. What it is for is reusing work WITHIN one
    // session: without it, every save recompiles everything from scratch.
    // (There used to be two duplicate `cache` keys here, the second cancelling the first.)
    cache: isProdBuild ? { type: 'filesystem' } : { type: 'memory' },
    // ...and node_modules is NOT to be treated as immutable. By default webpack calls it
    // a "managed path" and validates the cache against the package's VERSION, so changes
    // made by hand inside node_modules (a patch to @cornerstonejs, say) stayed invisible
    // for as long as the cache lived. With managedPaths empty those files are checked
    // like any other source, and a patch shows up at once.
    ...(isProdBuild ? {} : { snapshot: { managedPaths: [], immutablePaths: [] } }),
    module: {
      noParse: [/(dicomicc)/],
      rules: [
        ...(isProdBuild
          ? []
          : [
            {
              test: /\.[jt]sx?$/,
              exclude: /node_modules/,
              loader: 'babel-loader',
              options: {
                plugins: isProdBuild ? [] : ['react-refresh/babel'],
              },
            },
          ]),
        {
          test: /\.svg?$/,
          oneOf: [
            {
              use: [
                {
                  loader: '@svgr/webpack',
                  options: {
                    svgoConfig: {
                      plugins: [
                        {
                          name: 'preset-default',
                          params: {
                            overrides: {
                              removeViewBox: false,
                            },
                          },
                        },
                      ],
                    },
                    prettier: false,
                    svgo: true,
                    titleProp: true,
                  },
                },
              ],
              issuer: {
                and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
              },
            },
          ],
        },
        transpileJavaScriptRule(mode),
        loadWebWorkersRule,
        // loadShadersRule,
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        cssToJavaScript,
        // Note: Only uncomment the following if you are using the old style of stylus in v2
        // Also you need to uncomment this platform/app/.webpack/rules/extractStyleChunks.js
        // stylusToJavaScript,
        {
          test: /\.wasm/,
          type: 'asset/resource',
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: 'assets/images/[name].[ext]',
              },
            },
          ],
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: 'asset/resource',
        },
      ], //.concat(vtkRules),
    },
    resolve: {
      mainFields: ['module', 'browser', 'main'],
      alias: {
        // Viewer project
        '@': path.resolve(__dirname, '../platform/app/src'),
        '@components': path.resolve(__dirname, '../platform/app/src/components'),
        '@hooks': path.resolve(__dirname, '../platform/app/src/hooks'),
        '@routes': path.resolve(__dirname, '../platform/app/src/routes'),
        '@state': path.resolve(__dirname, '../platform/app/src/state'),
        'dicom-microscopy-viewer':
          'dicom-microscopy-viewer/dist/dynamic-import/dicomMicroscopyViewer.min.js',
      },
      // Which directories to search when resolving modules
      modules: [
        // Modules specific to this package
        path.resolve(__dirname, '../node_modules'),
        // Hoisted Yarn Workspace Modules
        path.resolve(__dirname, '../../../node_modules'),
        path.resolve(__dirname, '../platform/app/node_modules'),
        path.resolve(__dirname, '../platform/ui/node_modules'),
        SRC_DIR,
      ],
      // Attempt to resolve these extensions in order.
      extensions: ['.js', '.jsx', '.json', '.ts', '.tsx', '*'],
      // symlinked resources are resolved to their real path, not their symlinked location
      symlinks: true,
      fallback: {
        fs: false,
        path: false,
        zlib: false,
        buffer: require.resolve('buffer'),
      },
    },
    plugins: [
      new webpack.DefinePlugin(defineValues),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      ...(isProdBuild ? [] : [new ReactRefreshWebpackPlugin({ overlay: false })]),
      // Uncomment to generate bundle analyzer
      // new BundleAnalyzerPlugin(),
    ],
  };

  if (isProdBuild) {
    config.optimization.minimizer = [
      new TerserJSPlugin({
        parallel: true,
        terserOptions: {},
      }),
    ];
  }

  if (isQuickBuild) {
    config.optimization.minimize = false;
    config.devtool = false;
  }

  return config;
};
