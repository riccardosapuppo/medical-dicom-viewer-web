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

  // One tab is not a choice.
  //
  // When the patient has no earlier exams, only "Current study" is left: a button already
  // lit, leading where you already are. It takes a band forty-eight pixels tall above the
  // series list to say nothing at all.
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
            // No tab is ever disabled: an empty list usually means only that the priors
            // have not finished loading. Disabling the button cost the first click and
            // gave the reader nothing back.
            const isDisabled = false;
            const baseClasses = `${label && label.replace(/\s+/g, '').toLowerCase()} qualestudio-btn leading-none font-sans text-center justify-center items-center outline-none transition duration-300 ease-in-out focus:outline-none text-primary-light hover:bg-primary-light hover:text-black focus:text-black focus:bg-primary-light active:opacity-80 bg-black inline-flex border outline-none border border-r-0 last:border-r border border-secondary-light first:rounded-l-md last:rounded-r-md min-w-18 p-2 text-base text-white border-l-0 last:border-r-0`;
            return (
              <button
                key={name}
                onClick={() => handleTabChange(name)}
                disabled={isDisabled}
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
