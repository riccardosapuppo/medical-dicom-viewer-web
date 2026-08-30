# Third-party notices

This repository is a fork of the OHIF Viewer. The upstream copyright and licence
are in [LICENSE](LICENSE) alongside this author's, which is what the MIT licence
asks of anyone distributing a derivative.

Listed below is what this project is built on and what it carries. Each keeps its
own copyright and licence terms.

## OHIF Viewer

- Project: Open Health Imaging Foundation Viewer
- Source: https://github.com/OHIF/Viewers
- Version this was forked from: 3.10.0-beta.129
- Licence: MIT
- Copyright: OHIF contributors

The whole of `platform/`, `extensions/`, `modes/` and the build configuration
comes from upstream, with the additions described in the README layered on top.
The upstream documentation, changelog and continuous integration configuration
are not carried here: they belong to that project rather than to this one.

## Cornerstone

- Project: Cornerstone3D
- Source: https://github.com/cornerstonejs/cornerstone3D
- Licence: MIT

`@cornerstonejs/` holds a local copy of the tools package, linked in place of the
published one, carrying two changed files: reference lines confined to a single
study, and changes to the trackball. Everything else in that copy is upstream.

## Orthanc

- Container: `orthancteam/orthanc`
- Documentation: https://orthanc.uclouvain.be/book/
- Licence: GPLv3 for Orthanc, with the DICOMweb plugin under AGPLv3

Orthanc is used unmodified, as a container, to serve the demonstration studies
over DICOMweb. Nothing of it is redistributed here and nothing links against it:
the viewer talks to it over the network like any other client.

## The images

Real, de-identified clinical studies from The Cancer Imaging Archive. Neither the
pixel data nor its metadata is committed here; `scripts/fetch-studies.mjs`
downloads them and keeps the licence file the archive ships inside each download.

- LIDC-IDRI — CC BY 3.0 — doi 10.7937/K9/TCIA.2015.LO9QL9SX
- CPTAC-CCRCC — CC BY 4.0 — doi 10.7937/k9/tcia.2018.oblamn27

Data usage policy:
https://www.cancerimagingarchive.net/data-usage-policies-and-restrictions/

## What was deliberately left out

The reporting feature depends on a commercial reporting library. Neither the
library nor the feature is in this repository: redistributing the first is not
ours to do, and the second does not work without it.
