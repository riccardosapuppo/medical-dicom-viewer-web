// https://developers.google.com/web/tools/workbox/guides/codelabs/webpack
// ~~ WebPack
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const formattedDateTime = moment().format('YYYYMMDD-HHmmss');
const { merge } = require('webpack-merge');
const webpack = require('webpack');
const webpackBase = require('./../../../.webpack/webpack.base.js');
// ~~ Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { InjectManifest } = require('workbox-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// ~~ Directories
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const PUBLIC_DIR = path.join(__dirname, '../public');
// ~~ Env Vars
const HTML_TEMPLATE = process.env.HTML_TEMPLATE || 'index.html';
const PUBLIC_URL = process.env.PUBLIC_URL || '/';
const APP_CONFIG = process.env.APP_CONFIG || 'config/default.js';

// proxy settings
const PROXY_TARGET = process.env.PROXY_TARGET;
const PROXY_DOMAIN = process.env.PROXY_DOMAIN;
const PROXY_PATH_REWRITE_FROM = process.env.PROXY_PATH_REWRITE_FROM;
const PROXY_PATH_REWRITE_TO = process.env.PROXY_PATH_REWRITE_TO;

const OHIF_PORT = Number(process.env.OHIF_PORT || 3000);
const ENTRY_TARGET = process.env.ENTRY_TARGET || `${SRC_DIR}/index.js`;
const Dotenv = require('dotenv-webpack');
const writePluginImportFile = require('./writePluginImportsFile.js');
let version_number = fs.readFileSync(path.join(__dirname, '../../../version.txt'), 'utf8') || '';

class WriteVersionPlugin {
  apply(compiler) {
    compiler.hooks.done.tap('WriteVersionPlugin', () => {
      const fs = require('fs');
      const path = require('path');
      const versionFilePath = path.join(__dirname, '../dist/version.txt');
      const rootVersionPath = path.join(__dirname, '../../../version.txt');

      // Assicurati che la cartella 'dist' esista
      fs.mkdirSync(path.dirname(versionFilePath), { recursive: true });

      // IMPORTANTE: rileggo la versione FINALE dalla root version.txt (dopo il
      // bump di prebuild e l'eventuale append del timestamp in fase prod, riga
      // ~86). In questo modo dist/version.txt (= build-viewer/version.txt nel
      // pacchetto) coincide SEMPRE col nome del pacchetto generato da
      // postbuild-viewer.mjs, che usa la stessa root version.txt. Usare la
      // variabile di modulo version_number poteva contenere ancora la sola base
      // (es. "3.12.0") -> mismatch all'upload sulla dashboard.
      let finalVersion = '';
      try {
        finalVersion = fs.readFileSync(rootVersionPath, 'utf8').trim();
      } catch (err) {
        finalVersion = String(version_number).trim();
      }

      // Sostituisci "beta" con "prod" se presente
      const updatedVersion = finalVersion.includes('beta')
        ? finalVersion.replace('beta', 'prod')
        : finalVersion;

      // Scrivi il numero di versione nel file version.txt
      fs.writeFileSync(versionFilePath, `Version: ${updatedVersion}`, 'utf8');
      console.log('Versione aggiornata (dist/version.txt):', updatedVersion);
    });
  }
}

const copyPluginFromExtensions = writePluginImportFile(SRC_DIR, DIST_DIR);

const setHeaders = (res, path) => {
  if (path.indexOf('.gz') !== -1) {
    res.setHeader('Content-Encoding', 'gzip');
  } else if (path.indexOf('.br') !== -1) {
    res.setHeader('Content-Encoding', 'br');
  }
  if (path.indexOf('.pdf') !== -1) {
    res.setHeader('Content-Type', 'application/pdf');
  } else if (path.indexOf('mp4') !== -1) {
    res.setHeader('Content-Type', 'video/mp4');
  } else if (path.indexOf('frames') !== -1) {
    res.setHeader('Content-Type', 'multipart/related');
  } else {
    res.setHeader('Content-Type', 'application/json');
  }
};

module.exports = (env, argv) => {
  const baseConfig = webpackBase(env, argv, { SRC_DIR, DIST_DIR });
  const isProdBuild = process.env.NODE_ENV === 'production';
  const hasProxy = PROXY_TARGET && PROXY_DOMAIN;

  if (isProdBuild) {
    if (version_number.includes('_')) {
      version_number = version_number.split('_')[0]
    }
    version_number = `${version_number.replace(/\s+/g, '').replace('beta', 'prod')}_${formattedDateTime}`;
    fs.writeFileSync(path.join(__dirname, '../../../version.txt'), version_number, 'utf8');
  }

  const cacheBuster = isProdBuild ? version_number : formattedDateTime;

  const mergedConfig = merge(baseConfig, {
    entry: {
      app: ENTRY_TARGET,
      printBtn: path.join(__dirname, '../public/estensioni/stampa/printBtn.js'),
      preferitiBtn: path.join(__dirname, '../public/estensioni/preferiti/preferiti.js'),
      tabs: path.join(__dirname, '../public/estensioni/tabsAndExplorer/explorer.js'),
      explorer: path.join(__dirname, '../public/estensioni/tabsAndExplorer/tabs.js'),
      editorBtn: path.join(__dirname, '../public/estensioni/editor/editorBtn.js'),
      caricamentoHP: path.join(__dirname, '../public/estensioni/gestioneHP/caricamentoHP.js'),
      mostraChangelogAggiornamenti: path.join(__dirname, '../public/estensioni/mostraChangelogAggiornamenti/mostraChangelogAggiornamenti.js'),
      erroriFetch: path.join(__dirname, '../public/estensioni/erroriFetch/erroriFetch.ts'),
      gestioneMonitor: path.join(__dirname, '../public/estensioni/gestioneMonitor/gestioneMonitor.js'),
    },
    output: {
      path: DIST_DIR,
      filename: isProdBuild ? '[name].bundle.[chunkhash].js' : '[name].js',
      publicPath: PUBLIC_URL, // Used by HtmlWebPackPlugin for asset prefix
      devtoolModuleFilenameTemplate: function (info) {
        if (isProdBuild) {
          return `webpack:///${info.resourcePath}`;
        } else {
          return 'file:///' + encodeURI(info.absoluteResourcePath);
        }
      },
    },
    resolve: {
      modules: [
        // Modules specific to this package
        path.resolve(__dirname, '../node_modules'),
        // Hoisted Yarn Workspace Modules
        path.resolve(__dirname, '../../../node_modules'),
        SRC_DIR,
      ],
    },
    plugins: [
      new WriteVersionPlugin(),
      new webpack.DefinePlugin({
        'process.env.VERSION_NUMBER': JSON.stringify(version_number),
      }),
      new Dotenv(),
      // Clean output.path
      new CleanWebpackPlugin(),
      // Copy "Public" Folder to Dist
      new CopyWebpackPlugin({
        patterns: [
          ...copyPluginFromExtensions,
          {
            from: PUBLIC_DIR,
            to: DIST_DIR,
            toType: 'dir',
            globOptions: {
              // Ignore our HtmlWebpackPlugin template file
              // Ignore our configuration files
              ignore: ['**/config/**', '**/html-templates/**', '.DS_Store'],
            },
          },
          // Short term solution to make sure GCloud config is available in output
          // for our docker implementation
          {
            from: `${PUBLIC_DIR}/config/google.js`,
            to: `${DIST_DIR}/google.js`,
          },
          // Copy over and rename our target app config file
          {
            from: `${PUBLIC_DIR}/${APP_CONFIG}`,
            to: `${DIST_DIR}/app-config.js`,
            transform(content) {
              const contentString = content.toString();
              // window.isSuite: comportamento ORIGINALE del viewer → prod false (usa l'origin
              // deployata), dev true (in sviluppo il viewer punta al backend suite). La dashboard
              // PACS Analytics NON usa più isSuite (api.ts usa location.origin), quindi non serve
              // forzarlo: forzarlo interferirebbe solo col viewer.
              const isSuiteValue = isProdBuild ? 'false' : 'true';
              // enablePrintBuilder resta forzato a false: il generatore di stampa
              // dipende da una libreria commerciale che non viene distribuita con
              // questo repository, quindi il pulsante non deve comparire.
              //
              // showStudyList NON e piu forzato. Nell'impianto originale il viewer
              // veniva aperto dalla pagina ospite, che gli passava lo studio, e un
              // elenco non serviva; qui e il solo modo di entrare, quindi segue il
              // valore del sorgente.
              const updated = contentString
                .replace(/window\.isSuite\s*=\s*(?:true|false)\s*;/, `window.isSuite = ${isSuiteValue};`)
                .replace(/(\benablePrintBuilder\s*:\s*)(?:true|false)/, '$1false');
              return updated;
            },
          },
          {
            from: path.join(__dirname, '../build-tools/web.config'),
            to: path.join(DIST_DIR, 'web.config'),
            noErrorOnMissing: true,
          },
          // Copy Dicom Microscopy Viewer build files
          {
            from: '../../../node_modules/dicom-microscopy-viewer/dist/dynamic-import',
            to: DIST_DIR,
            globOptions: {
              ignore: ['**/*.min.js.map'],
            },
          },
        ],
      }),
      // Generate "index.html" w/ correct includes/imports
      new HtmlWebpackPlugin({
        template: `${PUBLIC_DIR}/html-templates/${HTML_TEMPLATE}`,
        filename: 'index.html',
        inject: false,
        templateParameters: {
          PUBLIC_URL: PUBLIC_URL,
          CACHE_BUSTER: cacheBuster,
        },
      }),
      // Generate a service worker for fast local loads
      new InjectManifest({
        swDest: 'sw.js',
        swSrc: path.join(SRC_DIR, 'service-worker.js'),
        // Need to exclude the theme as it is updated independently
        exclude: [/theme/],
        // Cache large files for the manifests to avoid warning messages
        maximumFileSizeToCacheInBytes: 1024 * 1024 * 50,
      }),
    ],
    // https://webpack.js.org/configuration/dev-server/
    devServer: {
      // gzip compression of everything served
      // Causes Cypress: `wait-on` issue in CI
      // compress: true,
      // http2: true,
      // https: true,
      open: true,
      port: OHIF_PORT,
      headers: {
        'Cache-Control': 'no-store', // Disabilita la cache durante lo sviluppo
      },
      // host: '192.168.18.134',
      client: {
        overlay: { errors: true, warnings: false },
      },
      proxy: {
        '/dicomweb': 'http://localhost:5000',
      },
      static: [
        {
          directory: '../../testdata',
          staticOptions: {
            extensions: ['gz', 'br', 'mht'],
            index: ['index.json.gz', 'index.mht.gz'],
            redirect: true,
            setHeaders,
          },
          publicPath: '/viewer-testdata',
        },
      ],
      //public: 'http://localhost:' + 3000,
      //writeToDisk: true,
      historyApiFallback: {
        disableDotRule: true,
        index: PUBLIC_URL + 'index.html',
      },
      devMiddleware: {
        writeToDisk: true,
      },
    },
  });

  if (hasProxy) {
    mergedConfig.devServer.proxy = mergedConfig.devServer.proxy || {};
    mergedConfig.devServer.proxy = {
      [PROXY_TARGET]: {
        target: PROXY_DOMAIN,
        changeOrigin: true,
        pathRewrite: {
          [`^${PROXY_PATH_REWRITE_FROM}`]: PROXY_PATH_REWRITE_TO,
        },
      },
    };
  }

  if (isProdBuild) {
    mergedConfig.plugins.push(
      new MiniCssExtractPlugin({
        filename: '[name].bundle.css',
        chunkFilename: '[id].css',
      })
    );
  }

  mergedConfig.watchOptions = {
    ignored: /node_modules\/@cornerstonejs/,
  };

  return mergedConfig;
};
