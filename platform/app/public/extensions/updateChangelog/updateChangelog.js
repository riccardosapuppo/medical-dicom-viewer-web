// /* eslint-disable default-case */

// const changelogAggiornamentiInitInterval = () => {
//   const changelogUpdatesInterval = setInterval(() => {
//     if (document.getElementById('trackedMeasurements-btn')) {
//       clearInterval(changelogUpdatesInterval);
//       injectChangelogAggiornamenti();
//     }
//   }, 100);

//   // The check interval is stopped after a while regardless, for the sake of performance
//   setTimeout(() => {
//     clearInterval(intervalChangelogUpdatesExt);
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
//   const favouritesBtn = document.getElementById('favourites-btn');
//   favouritesBtn.addEventListener('click', createFavourites);
// };
