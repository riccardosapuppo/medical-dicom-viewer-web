# Medical DICOM Viewer (Web)

A reading workspace for CT and MR studies, built as an extension and a mode for
the [OHIF Viewer](https://github.com/OHIF/Viewers) and shown against real
de-identified studies served from a DICOM archive.

This repository contains only those two packages and the scripts that assemble a
working viewer around them. OHIF is not vendored, forked or copied here: it is
cloned at a pinned commit and this code is linked into its workspace, which is
the arrangement OHIF documents for out-of-tree plugins.

The interface carries this project's name and mark rather than the viewer's.
OHIF is MIT licensed and permits that; what it asks is that the copyright travel
with the work, which it does, here and in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). What is rebranded is the
interface, not the authorship: the section below says plainly which part is
OHIF's and which part was written here.

## What is added, and what is not

Image display, measurement, window level, layouts, hanging protocols, the series
panel and the study list are OHIF's, and are used as they are. Reimplementing
any of that would be a worse version of something that already works.

The extension's viewport **wraps** `OHIFCornerstoneViewport` rather than
replacing it, so every tool, overlay and scrollbar in a viewport is the real
one. What it adds is:

**Montage.** A whole series laid out as a sheet of frames, the way film was hung
on a light box. Scrolling 133 slices to find the right level is slow; reading
them as a page is not. Clicking a frame returns to the stack at that instance.
Frames are drawn through Cornerstone's own off-screen renderer, so the modality
LUT, rescale and the window level currently set in the viewport all apply — the
montage shows what the viewport would show, not an approximation of it.

## Running it

Node 22.6 or newer, Docker, and about 250 MB of disk for the images.

```
npm run setup       # clone OHIF at the pinned commit and link this code into it
docker compose up -d
npm run data        # download the studies from the imaging archive
npm run data:load   # upload them into the archive
npm run dev         # http://localhost:3000
```

`npm run setup` writes nothing outside `.ohif/`, and can be run again at any
time. `npm run build` produces a static viewer under `.ohif/platform/app/dist`.

The viewer reaches the archive through the development server, which proxies
`/pacs/dicom-web` to Orthanc on port 8042. That makes every DICOMweb request
same-origin, so the archive needs no cross-origin configuration.

## The images

Three studies are downloaded at setup time from
[The Cancer Imaging Archive](https://www.cancerimagingarchive.net/): a 133 slice
chest CT, a three phase abdominal CT, and a renal MR of five sequences. They are
real clinical acquisitions, de-identified by the archive before publication.

No pixel data is committed to this repository. The full provenance, licence and
required citation for each collection is in [data/studies.json](data/studies.json);
each download also carries the archive's own licence file, which the fetch script
keeps beside the images it covers.

- **LIDC-IDRI** — CC BY 3.0, doi [10.7937/K9/TCIA.2015.LO9QL9SX](https://doi.org/10.7937/K9/TCIA.2015.LO9QL9SX)
- **CPTAC-CCRCC** — CC BY 4.0, doi [10.7937/k9/tcia.2018.oblamn27](https://doi.org/10.7937/k9/tcia.2018.oblamn27)

## Tests

```
npm test
```

The paging arithmetic and the zip reader are plain modules with no dependencies,
tested on Node's built-in runner. There is no test framework here because
nothing needed one. What unit tests cannot tell you is whether the extension
still compiles against OHIF, so continuous integration assembles the
distribution and builds it as well.

## What this is

A standalone piece of work, written from scratch, published to show how a
viewer of this kind is put together. It reimplements ideas from an earlier
closed-source project; no code, data or configuration from that work is present
here, and the studies are public research data rather than anything clinical.

The Orthanc configuration in `docker-compose.yml` has authentication disabled
and remote access allowed, which is appropriate for published images on a laptop
and for nothing else.

## Licence

MIT, see [LICENSE](LICENSE). Third-party components and their terms are listed
in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
