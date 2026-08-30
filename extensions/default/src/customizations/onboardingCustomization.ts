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
const prosegui = () => [
  {
    text: 'Chiudi',
    action() {
      this.complete();
    },
    secondary: true,
  },
  {
    text: 'Avanti',
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
          title: 'Scorrere la serie',
          text: 'La rotellina del mouse passa da un immagine all altra. Sul bordo destro della viewport la barra dice a che punto sei.',
          buttons: prosegui(),
        },
        {
          id: 'sottogriglia',
          title: 'La sottogriglia',
          text: 'Divide una viewport in righe e colonne, ognuna su un immagine diversa della stessa serie: serve a leggere una serie lunga senza scorrerla una fetta per volta. Le celle condividono la cache e gli strumenti, quindi luminosita, zoom e spostamento restano in passo fra loro.',
          buttons: prosegui(),
        },
        {
          id: 'mpr',
          title: 'Ricostruzione su tre piani',
          text: 'Apre assiale, sagittale e coronale della stessa serie, con i mirini agganciati fra loro. E una modalita a se: mentre e accesa il selettore dei layout cambia voci, e si esce dal pulsante Chiudi in alto a sinistra. Ha bisogno di una scheda grafica: senza, il pulsante resta spento e dice perche.',
          buttons: prosegui(),
        },
        {
          id: 'hanging',
          title: 'Salvare la disposizione',
          text: 'Cattura come stai guardando lo studio - la griglia, quale serie sta dove, la finestra di ogni viewport - e la ripropone al prossimo studio dello stesso tipo. La puoi legare a questo studio, a questo tipo di esame o a tutta la modality.',
          buttons: prosegui(),
        },
        {
          id: 'preferiti',
          title: 'I preferiti',
          text: 'La stella in alto a destra di ogni viewport segna l immagine. Quelle segnate finiscono nel pannello di destra, da riprendere quando si scrive il referto.',
          buttons: [
            {
              text: 'Ho capito',
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
