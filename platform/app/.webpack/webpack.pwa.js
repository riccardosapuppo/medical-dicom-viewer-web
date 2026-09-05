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

// Instradamento verso l archivio.
//
// I valori predefiniti sono quelli dell archivio che questo repository avvia
// con docker compose: Orthanc sulla 8042, che espone DICOMweb sotto
// /dicom-web, mentre la configurazione del visualizzatore chiede /pacs/dicom-web.
//
// Erano tutti e quattro senza ripiego, e chi seguiva il README con "yarn dev"
// otteneva un server senza inoltro: ogni richiesta di studi tornava indietro
// dal server di sviluppo invece che dall archivio, e la sola cosa che si
// vedeva era un avviso di sorgente dati irraggiungibile. Le variabili
// d ambiente restano, per puntare altrove.
const PROXY_TARGET = process.env.PROXY_TARGET || '/pacs/dicom-web';
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || 'http://localhost:8042';
const PROXY_PATH_REWRITE_FROM = process.env.PROXY_PATH_REWRITE_FROM || '/pacs/dicom-web';
const PROXY_PATH_REWRITE_TO = process.env.PROXY_PATH_REWRITE_TO || '/dicom-web';

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

      // La versione si scrive com e. Qui "beta" veniva riscritto in "prod".
      fs.writeFileSync(versionFilePath, `Version: ${finalVersion}`, 'utf8');
      console.log('Versione (dist/version.txt):', finalVersion);
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
    version_number = `${version_number.replace(/\s+/g, '')}_${formattedDateTime}`;
    fs.writeFileSync(path.join(__dirname, '../../../version.txt'), version_number, 'utf8');
  }

  const cacheBuster = isProdBuild ? version_number : formattedDateTime;

  const mergedConfig = merge(baseConfig, {
    entry: {
      app: ENTRY_TARGET,
      preferitiBtn: path.join(__dirname, '../public/estensioni/preferiti/preferiti.js'),
      tabs: path.join(__dirname, '../public/estensioni/tabsAndExplorer/explorer.js'),
      explorer: path.join(__dirname, '../public/estensioni/tabsAndExplorer/tabs.js'),
      editorBtn: path.join(__dirname, '../public/estensioni/editor/editorBtn.js'),
      caricamentoHP: path.join(__dirname, '../public/estensioni/gestioneHP/caricamentoHP.js'),
      mostraChangelogAggiornamenti: path.join(__dirname, '../public/estensioni/mostraChangelogAggiornamenti/mostraChangelogAggiornamenti.js'),
      erroriFetch: path.join(__dirname, '../public/estensioni/erroriFetch/erroriFetch.ts'),
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
            // Il file di configurazione viene copiato e basta.
            //
            // Qui c'era una riscrittura che a ogni build cambiava tre valori:
            // l'appartenenza alla pagina ospite, showStudyList e il generatore di
            // stampa. Erano tutti e tre modi di adattare il visualizzatore alla pagina
            // che lo apriva, e quella pagina non fa parte di questo repository. Il
            // sorgente e' la sola versione della verita': quello che c'e' scritto e'
            // quello che gira.
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
        // Nothing the development server hands out is stored. A stale bundle
        // in front of a viewer whose data source has moved on is a morning
        // spent debugging code that is not running any more.
        'Cache-Control': 'no-store',
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
            // `Cache-Control: no-store` above is not enough on its own: these
            // two are separate options, both default to on, and a response
            // carrying either is a response a browser may revalidate and be
            // told 304 — which is the stale page the header was meant to stop.
            // `lastModified` in particular is the one everybody forgets,
            // because turning off `etag` feels like it covered it.
            etag: false,
            lastModified: false,
          },
          publicPath: '/viewer-testdata',
        },
      ],
      //public: 'http://localhost:' + 3000,
      //writeToDisk: true,
      historyApiFallback: {
        // `disableDotRule: true` stood here, and it turns off the one guard
        // that keeps a request NAMING A FILE out of the single-page fallback.
        // With it on, `/ngsw.json` or `/main.old.js` came back as index.html
        // with a 200 — a missing file that looks like a working page, and a
        // service worker handed the application in place of its own manifest.
        // A path with a dot in it now falls through to a real 404.
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
