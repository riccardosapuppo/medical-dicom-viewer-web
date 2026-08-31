import React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../DropdownMenu/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../Tooltip';

export function StudyBrowserViewOptions({ tabs, onSelectTab, activeTabName }: withAppTypes) {
  const handleTabChange = (tabName: string) => {
    onSelectTab(tabName);
  };



  // return (
  //   <div className="border-inputfield-main focus:border-inputfield-main flex h-[26px] w-[125px] items-center justify-center rounded border bg-black p-2">
  //     <select
  //       onChange={e => handleTabChange(e.target.value)}
  //       value={activeTabName}
  //       onClick={e => e.stopPropagation()}
  //       className="w-full appearance-none bg-transparent text-sm leading-tight text-white shadow transition duration-300 focus:outline-none"
  //     >
  //       {tabs.map(tab => {
  //         const { name, label, studies } = tab;
  //         const isActive = activeTabName === name;
  //         const isDisabled = !studies.length;
  //         if (isDisabled) {
  //           return null;
  //         }
  //         return (
  //           <option
  //             className={`appearance-none bg-black text-white ${isActive ? 'font-bold' : ''}`}
  //             value={name}
  //             key={name}
  //           >
  //             {label}
  //           </option>
  //         );
  //       })}
  //     </select>
  //   </div>
  // ); window.portableVersion ? (

  // Una linguetta sola non e una scelta.
  //
  // Quando il paziente non ha esami precedenti resta il solo "Studio attuale":
  // un pulsante gia acceso, che porta dove si e gia. Occupa una fascia alta
  // quarantotto pixel sopra l'elenco delle serie per non dire niente.
  if (!tabs || tabs.length < 2) {
    return null;
  }

  return (
    !window.portableVersion && (
      <div>
        <div className="group inline-flex flex-row">
          {tabs.map(tab => {
            const { name, label, studies } = tab;
            const isActive = activeTabName === name;
            // Nessuna tab viene disabilitata: una lista vuota di solito significa solo che
            // lo storico non ha ancora finito di caricare (o, per 'remoteAll', che la
            // ricerca sul centro parte proprio al click). Disabilitare il bottone faceva
            // perdere il primo click senza dare alcun riscontro all'utente.
            const isDisabled = false;
            const baseClasses = `${label && label.replace(/\s+/g, '').toLowerCase()} qualestudio-btn leading-none font-sans text-center justify-center items-center outline-none transition duration-300 ease-in-out focus:outline-none text-primary-light hover:bg-primary-light hover:text-black focus:text-black focus:bg-primary-light active:opacity-80 bg-black inline-flex border outline-none border border-r-0 last:border-r border border-secondary-light first:rounded-l-md last:rounded-r-md min-w-18 p-2 text-base text-white border-l-0 last:border-r-0`;
            return (
              <button
                key={name}
                onClick={() => handleTabChange(name)}
                disabled={isDisabled}
                // className={`${baseClasses} rounded border px-4 py-2 ${isActive ? 'bg-blue-500 font-bold text-white' : 'bg-gray-700 text-white'} ${!isDisabled && window.studiRemoti[0].description === 'Nessuno storico remoto' ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-400'}`}
                className={`${baseClasses} rounded border px-4 py-2 ${isActive ? 'active-tab-study bg-blue-500 font-bold text-white hover:!text-black focus:!text-black' : 'inactive-tab-study bg-gray-700 text-white'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    )
  );
}
