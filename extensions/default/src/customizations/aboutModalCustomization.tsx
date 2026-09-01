import React from 'react';
import { AboutModal } from '@ohif/ui-next';
import detect from 'browser-detect';

function AboutModalDefault() {
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substr(1)} ${version}`;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  // La versione di questo progetto, e la versione da cui parte.
  //
  // Lo split sul trattino resta perche' e' cosi' che si separa un pre-rilascio
  // (1.2.0-rc.1), ma la base del fork non passa piu' di qui: e' un fatto
  // diverso, e messa nel numero lo spezzava a meta'.
  const [main, prerilascio] = String(versionNumber).split('-');
  const baseFork = '3.10.0-beta.129';

  return (
    <AboutModal className="w-[400px]">
      <AboutModal.ProductName>Medical DICOM Viewer</AboutModal.ProductName>
      <AboutModal.ProductVersion>{main}</AboutModal.ProductVersion>
      {/* La parte dopo il trattino si mostra com e. Qui la parola "beta"
          veniva riscritta in "prod" per non metterla davanti a un cliente:
          su un fork dichiarato serve solo a far sembrare stabile una
          versione che stabile non e. */}
      {prerilascio && <AboutModal.ProductBeta>{prerilascio}</AboutModal.ProductBeta>}

      <AboutModal.Body>
        {/* <AboutModal.DetailItem
          label="Commit Hash"
          value={commitHash}
        /> */}
        <AboutModal.DetailItem
          label="Sviluppato da"
          value="Riccardo Sapuppo"
        />
        <AboutModal.DetailItem
          label="Basato su"
          value={`OHIF Viewer ${baseFork}`}
        />
        <AboutModal.DetailItem
          label="Revisione"
          value={commitHash || '-'}
        />
        <AboutModal.DetailItem
          label="Browser corrente & SO"
          value={`${browser}, ${os}`}
        />
        {/* <AboutModal.SocialItem
          icon="SocialGithub"
          url="OHIF/Viewers"
          text="github.com/OHIF/Viewers"
        /> */}
      </AboutModal.Body>
    </AboutModal>
  );
}

export default {
  'ohif.aboutModal': AboutModalDefault,
};
