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

// Routing towards the archive.
//
// The defaults are those of the archive this repository starts with docker compose:
// Orthanc on 8042, which exposes DICOMweb under /dicom-web, while the viewer's
// configuration asks for /pacs/dicom-web.
//
// All four had no fallback, so anyone following the README with "yarn dev" got a server
// with no forwarding: every request for studies came back from the development server
// rather than the archive, and all they saw was a notice that the data source was out of
// reach. The environment variables are still there, for pointing somewhere else.
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

      // Make sure the 'dist' folder is there
      fs.mkdirSync(path.dirname(versionFilePath), { recursive: true });

      // The FINAL version is read again from the root version.txt, after prebuild's bump
      // and the timestamp that production appends around line 86. That way
      // dist/version.txt, which becomes build-viewer/version.txt in the package, ALWAYS
      // matches the name of the package postbuild-viewer.mjs produces, since that uses
      // the same root version.txt. The module variable version_number could still hold
      // the bare base ("3.12.0"), and then the upload to the dashboard would mismatch.
      let finalVersion = '';
      try {
        finalVersion = fs.readFileSync(rootVersionPath, 'utf8').trim();
      } catch (err) {
        finalVersion = String(version_number).trim();
      }

      // The version is written as it is. This used to rewrite "beta" as "prod".
      fs.writeFileSync(versionFilePath, `Version: ${finalVersion}`, 'utf8');
      console.log('Version (dist/version.txt):', finalVersion);
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
    // This file decides rules the base one knows nothing about, so it belongs in the
    // list that invalidates the cache: editing it must not leave a build made under
    // the previous version in place. webpack-merge appends, it does not replace.
    cache: { buildDependencies: { config: [__filename] } },
    entry: {
      app: ENTRY_TARGET,
      favouritesBtn: path.join(__dirname, '../public/extensions/favourites/favourites.js'),
      tabs: path.join(__dirname, '../public/extensions/tabsAndExplorer/explorer.js'),
      explorer: path.join(__dirname, '../public/extensions/tabsAndExplorer/tabs.js'),
      editorBtn: path.join(__dirname, '../public/extensions/editor/editorBtn.js'),
      loadHangingProtocol: path.join(__dirname, '../public/extensions/hangingProtocols/loadHangingProtocol.js'),
      updateChangelog: path.join(__dirname, '../public/extensions/updateChangelog/updateChangelog.js'),
      fetchErrors: path.join(__dirname, '../public/extensions/fetchErrors/fetchErrors.ts'),
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
            // The configuration file is copied, and nothing more.
            //
            // There used to be a rewrite here that changed three values on every build:
            // whether it belonged to the host page, showStudyList, and the print
            // generator. All three were ways of fitting the viewer to the page that
            // opened it, and that page is not part of this repository. The source is the
            // only version of the truth: what is written there is what runs.
          },
          // There used to be a `build-tools/web.config` copied here: the settings file
          // an IIS site needs, for a deployment that is not part of this repository.
          // The folder does not exist, and `noErrorOnMissing` meant nobody noticed --
          // except webpack, which watches the paths it was told about and did not find,
          // in case they appear later.
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
      // Generate a service worker for fast local loads -- SOLO in produzione.
      //
      // init-service-worker.js lo registra soltanto quando l'host non e'
      // localhost, quindi in sviluppo sw.js veniva costruito e non lo apriva
      // nessuno. E non era gratis: per scrivere la lista da precaricare workbox
      // legge e marca ogni file emesso, e in sviluppo quella lista era di 240
      // URL per 116 MB, a ogni compilazione.
      ...(isProdBuild
        ? [
            new InjectManifest({
              swDest: 'sw.js',
              swSrc: path.join(SRC_DIR, 'service-worker.js'),
              // Need to exclude the theme as it is updated independently
              exclude: [/theme/],
              // Cache large files for the manifests to avoid warning messages
              maximumFileSizeToCacheInBytes: 1024 * 1024 * 50,
            }),
          ]
        : []),
    ],
    // https://webpack.js.org/configuration/dev-server/
    devServer: {
      // gzip compression of everything served
      // Causes Cypress: `wait-on` issue in CI
      // compress: true,
      // http2: true,
      // https: true,
      // `yarn start` opens the browser itself, when the build is finished and
      // the viewer answers. Left to itself the server opens one as soon as it
      // binds the port, which is a tab watching an empty page.
      open: !process.env.OHIF_NO_OPEN,
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

  // WHAT IS WATCHED, AND WHAT IS WATCHED BUT IS NOT THERE.
  //
  // The pattern is matched against real file names, and on Windows those are written
  // with a backslash: with only a forward slash it matched nothing, ever, and read as
  // though it were doing something.
  //
  // The second half is not a folder at all. `@ohif/ui` is a workspace package, hoisted
  // to the root node_modules, so resolving it under platform/app fails -- and webpack
  // watches what it was told about and did not find, in case it turns up. On the
  // watcher's first cycle those absences are reported as removals, and that alone
  // bought a second full compilation right after the first.
  //
  // One expression and not two: `ignored` takes a single regular expression, or globs
  // as strings. An array of regular expressions fails validation and webpack refuses
  // to start, which is at least a way of finding out.
  mergedConfig.watchOptions = {
    ignored: /(node_modules[\\/]@cornerstonejs|platform[\\/]app[\\/]node_modules[\\/]@ohif)/,
  };

  return mergedConfig;
};
