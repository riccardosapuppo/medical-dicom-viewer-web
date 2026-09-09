/**
 * The guided tour that opens the first time a study is opened.
 *
 * The upstream one described the original viewer in English and hung off buttons this
 * project has moved. Worse: it looked for its first anchor for half a second, while a
 * study here takes some twenty seconds to arrive. Not finding it, it showed the step
 * anyway, and with no element to stand beside it ended up just under the bottom edge of
 * the screen: invisible, with the page dimmed to seventy per cent and no way to close
 * it. That was the first thing anyone opening this project saw.
 *
 * This one describes instead the four things this viewer has that the original does not,
 * waits until there is really something to point at, and closes itself if nothing has
 * appeared after a minute.
 */

/** A step's two buttons, made fresh for each step. */
const stepButtons = () => [
  {
    text: 'Close',
    action() {
      this.complete();
    },
    secondary: true,
  },
  {
    text: 'Next',
    action() {
      this.next();
    },
  },
];

export default {
  'ohif.tours': [
    {
      id: 'basicViewerTour',
      route: '/viewer',
      // The tour does not start until there is a viewport to point at. See
      // Onboarding.tsx: Shepherd resolves its targets when the tour starts, and the study
      // arrives from the archive some twenty seconds later.
      waitFor: '.viewport-element',
      steps: [
        {
          id: 'scorrimento',
          title: 'Scrolling a series',
          text: 'The mouse wheel moves from one image to the next. The bar down the right edge of the viewport says where you are.',
          buttons: stepButtons(),
        },
        {
          id: 'subgrid',
          title: 'The subgrid',
          text: 'It splits one viewport into rows and columns, each on a different image of the same series, so a long series can be read without scrolling it a slice at a time. The cells share the cache and the tools, so brightness, zoom and panning stay in step.',
          buttons: stepButtons(),
        },
        {
          id: 'mpr',
          title: 'Reconstruction on three planes',
          text: 'It opens the axial, sagittal and coronal planes of one series with the crosshairs locked together. It is a mode of its own: while it is on, the layout selector shows different entries, and you leave it from the Close button at the top left. It needs a graphics card; without one the button stays off and says why.',
          buttons: stepButtons(),
        },
        {
          id: 'hanging',
          title: 'Saving the arrangement',
          text: 'It captures how you are reading the study, the grid, which series sits where, the window of each viewport, and puts it back on the next study of the same kind. You can tie it to this study, to this kind of exam, or to the whole modality.',
          buttons: stepButtons(),
        },
        {
          id: 'favourites',
          title: 'Favourites',
          text: 'The star at the top right of each viewport marks the image. Marked images land in the right-hand panel, ready to pick up when the report is written.',
          buttons: [
            {
              text: 'Got it',
              action() {
                this.complete();
              },
            },
          ],
        },
      ],
      tourOptions: {
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          scrollTo: false,
        },
      },
    },
  ],
};
