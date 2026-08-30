import React, { useEffect, useState, useRef } from 'react';
import classnames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES, useSystem } from '@ohif/core';

import Dropzone from 'react-dropzone';
import filesToStudies from './filesToStudies';

import { extensionManager } from '../../App';

import { Icon, LoadingIndicatorProgress, LoadingIndicatorTotalPercent } from '@ohif/ui';
import { Icons, Button } from '@ohif/ui-next';
let totalFiles = 0;

const getLoadButton = (onDrop, text, isDir) => {
  return (
    <Dropzone
      onDrop={onDrop}
      noDrag
    >
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            variant="default"
            className="w-28"
            disabled={false}
            endIcon={<Icons.LaunchArrow />}
            className={classnames('font-medium', 'ml-2')}
            onClick={() => { }}
          >
            {text}
            {isDir ? (
              <input
                {...getInputProps()}
                webkitdirectory="true"
                mozdirectory="true"
                style={{ display: 'none' }}
              />
            ) : (
              <input
                {...getInputProps()}
                style={{ display: 'none' }}
              />
            )}
          </Button>
        </div>
      )}
    </Dropzone>
  );
};

type LocalProps = {
  modePath: string;
};

function Local({ modePath }: LocalProps) {
  const { servicesManager } = useSystem();
  const { customizationService } = servicesManager.services;
  const navigate = useNavigate();
  const dropzoneRef = useRef();
  const [dropInitiated, setDropInitiated] = React.useState(false);

  const [percentComplete, setPercentComplete] = useState(0);

  const LoadingIndicatorProgress = customizationService.getCustomization(
    'ui.loadingIndicatorProgress'
  );

  // Initializing the dicom local dataSource
  const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
  const localDataSources = dataSourceModules.reduce((acc, curr) => {
    const mods = [];
    curr.module.forEach(mod => {
      if (mod.type === 'localApi') {
        mods.push(mod);
      }
    });
    return acc.concat(mods);
  }, []);

  const firstLocalDataSource = localDataSources[0];
  const dataSource = firstLocalDataSource.createDataSource({});

  const microscopyExtensionLoaded = extensionManager.registeredExtensionIds.includes(
    '@ohif/extension-dicom-microscopy'
  );

  const getFileNumber = async () => {
    const response = await fetch(`http://localhost:8088/getFileNumber`);
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const numeroFile = await response.json(); // Ottieni i dati in JSON
    totalFiles = numeroFile.totalFiles;
    return totalFiles;
  };

  const fetchLocalFile = async () => {
    const numeroFile = await getFileNumber();
    try {
      let completedRequests = 0; // Conta il numero di richieste completate
      const promises = [];

      for (let i = 0; i < numeroFile; i++) {
        promises.push(
          fetch(`http://localhost:8088/getFileByIndex/${i}`).then(response => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.arrayBuffer().then(arrayBuffer => {
              const uint8Array = new Uint8Array(arrayBuffer);
              const contentDisposition = response.headers.get('Content-Disposition');
              const match = contentDisposition && contentDisposition.match(/filename="(.+)"/);
              const fileName = match ? match[1] : `file_${i}.dcm`;

              // Aggiorna il progresso quando una richiesta è completata
              completedRequests++;
              const progress = Math.round((completedRequests / numeroFile) * 100);
              setPercentComplete(progress); // Aggiorna la percentuale completata

              return new File([uint8Array], fileName);
            });
          })
        );
      }

      const files = await Promise.all(promises);
      onDrop(files); // Esegui una volta completato
      setPercentComplete(100); // Imposta la percentuale finale al 100%
    } catch (error) {
      console.error('Fetch error:', error);
    }
  };

  const onDrop = async acceptedFiles => {
    const studies = await filesToStudies(acceptedFiles, dataSource);

    const query = new URLSearchParams();

    if (microscopyExtensionLoaded) {
      // TODO: for microscopy, we are forcing microscopy mode, which is not ideal.
      //     we should make the local drag and drop navigate to the worklist and
      //     there user can select microscopy mode
      const smStudies = studies.filter(id => {
        const study = DicomMetadataStore.getStudy(id);
        return (
          study.series.findIndex(s => s.Modality === 'SM' || s.instances[0].Modality === 'SM') >= 0
        );
      });

      if (smStudies.length > 0) {
        smStudies.forEach(id => query.append('StudyInstanceUIDs', id));

        modePath = 'microscopy';
      }
    }

    // Todo: navigate to work list and let user select a mode
    studies.forEach(id => query.append('StudyInstanceUIDs', id));
    query.append('datasources', 'dicomlocal');

    navigate(`/${modePath}?${decodeURIComponent(query.toString())}`);
  };

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  useEffect(() => {
    if (window.window.portableVersion) {
      fetchLocalFile();
    }
  }, []);

  return window.portableVersion ? (
    <div className="absolute top-0 left-0 z-50 flex h-full w-full flex-col items-center justify-center space-y-5">
      <Icon
        style={{ marginBottom: '90px' }}
        name="logoMdv"
        className="h-14"
      />
      <LoadingIndicatorTotalPercent
        className="h-full w-full"
        totalNumbers={totalFiles}
        percentComplete={percentComplete}
        loadingText="Caricamento dello studio in corso..."
        targetText="File"
      />
    </div>
  ) : (
    <Dropzone
      ref={dropzoneRef}
      onDrop={acceptedFiles => {
        setDropInitiated(true);
        onDrop(acceptedFiles);
      }}
      noClick
    >
      {({ getRootProps }) => (
        <div
          {...getRootProps()}
          style={{ width: '100%', height: '100%' }}
        >
          <div className="flex h-screen w-screen items-center justify-center">
            <div className="bg-muted border-primary/60 mx-auto space-y-2 rounded-xl border border-dashed py-12 px-12 drop-shadow-md">
              <div className="flex items-center justify-center">
                <Icon
                  name="logoMdv"
                  className="h-14"
                />
              </div>
              <div className="space-y-2 py-6 text-center">
                {dropInitiated ? (
                  <div className="flex flex-col items-center justify-center pt-12">
                    <LoadingIndicatorProgress className={'h-full w-full bg-black'} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* <p className="text-base text-blue-300">
                        Note: Your data is not uploaded to any server; it will stay in your local
                        browser application
                      </p> */}
                    <p className="text-primary-active pt-6 text-lg font-semibold">
                      Trascina i file DICOM qui
                    </p>
                    <p className="text-lg text-blue-300">O clicca </p>
                  </div>
                )}
              </div>
              <div className="flex justify-around pt-4">
                {getLoadButton(onDrop, 'Carica file', false)}
                {getLoadButton(onDrop, "Carica l'intera cartella", true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dropzone>
  );
}

export default Local;
