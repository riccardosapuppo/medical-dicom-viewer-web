// /* eslint-disable default-case */

// const changelogAggiornamentiInitInterval = () => {
//   const intervalChangelogAggiornamentiExt = setInterval(() => {
//     if (document.getElementById('trackedMeasurements-btn')) {
//       clearInterval(intervalChangelogAggiornamentiExt);
//       injectChangelogAggiornamenti();
//     }
//   }, 100);

//   //A prescindere blocco l'intervallo check dopo un tot per performance
//   setTimeout(() => {
//     clearInterval(intervalChangelogAggiornamentiExt);
//   }, 10000);
// };

// const injectChangelogAggiornamenti = () => {
//   document.body.insertAdjacentHTML(
//     'afterend',
//     `
//     <div id="changelog-popup" class="popup-overlay">
//         <div class="popup-content">
//             <h2>What's New in Version 2.0.0</h2>
//             <ul>
//                 <li>Improved user interface with a new design.</li>
//                 <li>Added dark mode support.</li>
//                 <li>Enhanced performance and fixed bugs.</li>
//                 <li>New features: Export data to CSV, Custom reports.</li>
//             </ul>
//             <button id="close-popup">Close</button>
//         </div>
//     </div>
//     `
//   );
//   const preferitiBtn = document.getElementById('preferiti-btn');
//   preferitiBtn.addEventListener('click', createPreferitiFunc);
// };
