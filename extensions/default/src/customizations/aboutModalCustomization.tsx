import React from 'react';
import { AboutModal } from '@ohif/ui-next';
import detect from 'browser-detect';

function AboutModalDefault() {
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substr(1)} ${version}`;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  // This project's version, and the version it starts from.
  //
  // The split on the hyphen stays, because that is how a pre-release is separated
  // (1.2.0-rc.1), but the fork's base no longer goes through here: it is a different
  // fact, and putting it in the number split it in half.
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
        {/* Da dove viene. Chi apre il visualizzatore da un link non legge mai il
            README, e questa e' la sola schermata del prodotto che parla della
            sua provenienza: sta qui, sotto il resto, e non in cima a una pagina. */}
        <div className="text-muted-foreground max-w-[22rem] pt-4 text-xs leading-relaxed">
          A demonstration. It reconstructs a production system I designed and
          developed; the original cannot be published, so this one was written
          from scratch.
        </div>
        {/* La firma sta qui sotto e non piu' fra le voci in alto: il nome porta
            al profilo, e una voce etichetta/valore non puo' contenere un link. */}
        <div className="text-muted-foreground max-w-[22rem] pt-2 text-xs leading-relaxed">
          Developed by{' '}
          <a
            href="https://github.com/riccardosapuppo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary focus-visible:ring-ring rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1"
          >
            Riccardo Sapuppo
          </a>
        </div>
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
