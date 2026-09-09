/**
 * Il giro guidato che si apre alla prima apertura di uno studio.
 *
 * Quello a monte raccontava il visualizzatore originale in inglese e si
 * agganciava a bottoni che questo progetto ha spostato. Peggio: cercava il suo
 * primo appiglio per mezzo secondo, mentre qui lo studio ci mette una ventina di
 * secondi ad arrivare. Non trovandolo mostrava comunque il passo, ma senza un
 * elemento accanto a cui stare finiva appena sotto il bordo dello schermo:
 * invisibile, con la pagina velata al settanta per cento e nessun modo di
 * chiuderlo. Era la prima cosa che vedeva chi apriva il progetto.
 *
 * Questo racconta invece le quattro cose che questo visualizzatore ha in piu',
 * aspetta che ci sia davvero qualcosa da indicare, e si chiude da solo se dopo
 * un minuto non e' comparso niente.
 */

/** I due pulsanti di un passo, nuovi per ogni passo. */
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
      // Il giro non parte finche non c e una viewport da indicare. Vedi
      // Onboarding.tsx: Shepherd risolve i bersagli quando il giro parte, e
      // qui lo studio arriva dall archivio una ventina di secondi dopo.
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
