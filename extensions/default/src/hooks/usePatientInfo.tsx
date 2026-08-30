import { useState, useEffect } from 'react';
import { utils } from '@ohif/core';

const { formatPN, formatDate } = utils;
let primoAvvio = true

function usePatientInfo(servicesManager: AppTypes.ServicesManager) {
  const { displaySetService } = servicesManager.services;

  const [patientInfo, setPatientInfo] = useState({
    PatientName: '',
    PatientID: '',
    PatientSex: '',
    PatientDOB: '',
  });
  const [isMixedPatients, setIsMixedPatients] = useState(false);

  //Forzo l'aggiornamento delle info paziente non appena displaySets è popolato
  // if (primoAvvio && displaySets[0]?.instances?.[0]) {
  //   updatePatientInfo()
  //   primoAvvio = false
  // }

  function checkMixedPatients(PatientID) {
    const displaySets = displaySetService.getActiveDisplaySets();
    let isMixedPatients = false;
    displaySets.forEach(displaySet => {
      const instance = displaySet?.instances?.[0] || displaySet?.instance;
      if (!instance) {
        return;
      }
      if (instance.PatientID !== PatientID) {
        isMixedPatients = true;
      }
    });
    setIsMixedPatients(isMixedPatients);
  };

  function updatePatientInfo({ displaySetsAdded }) {
    if (!displaySetsAdded.length) {
      return;
    }
    const displaySet = displaySetsAdded[0];
    const instance = displaySet?.instances?.[0] || displaySet?.instance;
    if (!instance) {
      return;
    }

    setPatientInfo({
      PatientID: instance.PatientID || null,
      PatientName: instance.PatientName ? formatPN(instance.PatientName) : null,
      PatientSex: instance.PatientSex || null,
      PatientDOB: formatDate(instance.PatientBirthDate) || null,
    });
    window.mdvStudyInfo = {
      AccessionNumber: instance.AccessionNumber || null,
      Modality: instance.Modality || null,
      StudyDescription: instance.StudyDescription || null,
      StudyDate: formatDate(instance.StudyDate) || null,
    };
    checkMixedPatients(instance.PatientID || null);
  };

  useEffect(() => {
    const subscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      props => updatePatientInfo(props)
    );
    return () => subscription.unsubscribe();
  }, []);

  return { patientInfo, isMixedPatients };
}

export default usePatientInfo;
