# Third-party notices

This repository's original source code is licensed under the MIT License in `LICENSE`. The projects below are either target platforms, direct dependencies, development tools, or container images used by the demonstration. They retain their own copyright and license terms.

## OHIF Viewer

- Project: Open Health Imaging Foundation Viewer
- Source: https://github.com/OHIF/Viewers
- Documentation: https://docs.ohif.org/3.11/
- License: MIT
- Copyright: OHIF contributors

No OHIF source tree or compiled distribution is vendored here. The extension and mode target the public OHIF 3.11 extension interfaces. The upstream MIT notice remains available from the linked source repository.

## Orthanc and the DICOMweb plugin

- Container: `orthancteam/orthanc:26.4.2`
- Image source: https://github.com/orthanc-server/orthanc-builder
- Orthanc documentation: https://orthanc.uclouvain.be/book/
- DICOMweb plugin documentation: https://orthanc.uclouvain.be/book/plugins/dicomweb.html
- Orthanc core license: GNU GPL version 3 or later

The Docker image is used as an unmodified, separate process. It contains Orthanc, the DICOMweb plugin, and other packaged components with their applicable licenses. The image and linked upstream sources are the authoritative source for the complete notices and corresponding source code.

## JavaScript packages

- React and React DOM: MIT, https://github.com/facebook/react
- dcmjs: MIT, https://github.com/dcmjs-org/dcmjs
- Vite: MIT, https://github.com/vitejs/vite
- Vitest: MIT, https://github.com/vitest-dev/vitest
- Testing Library: MIT, https://github.com/testing-library
- TypeScript: Apache-2.0, https://github.com/microsoft/TypeScript

`package-lock.json` records the exact dependency graph and versions.

## Runtime container images

- `nginxinc/nginx-unprivileged:1.27-alpine`: nginx and image components under their respective licenses, https://github.com/nginx/docker-nginx-unprivileged
- `curlimages/curl:8.12.1`: curl and image components under their respective licenses, https://github.com/curl/curl-container
- `node:20.18.1-alpine`: used only as the build stage, https://github.com/nodejs/docker-node

No third-party project listed above endorses this demonstration.
