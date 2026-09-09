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
  const [main, prerelease] = String(versionNumber).split('-');
  const baseFork = '3.10.0-beta.129';

  return (
    <AboutModal className="w-[400px]">
      <AboutModal.ProductName>Medical DICOM Viewer</AboutModal.ProductName>
      <AboutModal.ProductVersion>{main}</AboutModal.ProductVersion>
      {/* What comes after the hyphen is shown as it is. The word "beta" used to
          be rewritten as "prod" so it would not appear in front of a client. On a
          fork that says it is one, that only makes a version look stable when it
          is not. */}
      {prerelease && <AboutModal.ProductBeta>{prerelease}</AboutModal.ProductBeta>}

      <AboutModal.Body>
        {/* <AboutModal.DetailItem
          label="Commit Hash"
          value={commitHash}
        /> */}
        <AboutModal.DetailItem
          label="Based on"
          value={`OHIF Viewer ${baseFork}`}
        />
        <AboutModal.DetailItem
          label="Revision"
          value={commitHash || '-'}
        />
        <AboutModal.DetailItem
          label="Browser and OS"
          value={`${browser}, ${os}`}
        />
        {/* Where it comes from. Anyone who opens the viewer from a link never reads
            the README, and this is the only screen in the product that says where it
            came from: here, under the rest, rather than at the top of a page. */}
        <div className="text-muted-foreground max-w-[22rem] pt-4 text-xs leading-relaxed">
          A demonstration. It reconstructs a production system I designed and
          developed; the original cannot be published, so this one was written
          from scratch.
        </div>
        {/* The signature sits down here rather than among the entries above: the
            name links to the profile, and a label-and-value entry cannot hold a link. */}
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
