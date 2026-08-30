import React from 'react';
import PropTypes from 'prop-types';
import detect from 'browser-detect';
import { useTranslation } from 'react-i18next';

import Typography from '../Typography';
import { Icons } from '@ohif/ui-next';

const Link = ({ href, children, showIcon = false }) => {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Typography
        variant="subtitle"
        component="p"
        color="primaryActive"
        className="flex items-center"
      >
        {children}
        {!!showIcon && <Icons.ExternalLink className="ml-2 w-5 text-white" />}
      </Typography>
    </a>
  );
};

const Row = ({ title, value, link }) => {
  return (
    <div className="mb-4 flex">
      <Typography
        variant="subtitle"
        component="p"
        className="w-48 text-white"
      >
        {title}
      </Typography>

      {link ? (
        <Link href={link}>{value}</Link>
      ) : (
        <Typography
          variant="subtitle"
          component="p"
          className="w-48 text-white"
        >
          {value}
        </Typography>
      )}
    </div>
  );
};

const AboutModal = ({ buildNumber, versionNumber, commitHash }) => {
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substr(1)} ${version}`;
  const { t } = useTranslation('AboutModal');

  const renderRowTitle = title => (
    <div className="mb-3 border-b-2 border-black pb-3">
      <Typography
        variant="inherit"
        color="primaryLight"
        className="text-[16px] font-semibold !leading-[1.2]"
      >
        {title}
      </Typography>
    </div>
  );
  return (
    <div>
      <div className="flex flex-col">
        <img
          style={{ width: '130px', marginBottom: '20px' }}
          src="assets/logo_mdv.png"
          alt="logo-mdv"
        />
        <Row
          title={t('URL')}
          value="http://localhost:3000/"
          link="http://localhost:3000/"
        />
        <Row
          title={t('Versione')}
          value={versionNumber.includes('beta') ? versionNumber.replace('beta', 'prod') : versionNumber}
        />
        {buildNumber && (
          <Row
            title={t('Build number')}
            value={buildNumber}
          />
        )}
        <Row
          title={t('Browser')}
          value={browser}
        />
        <Row
          title={t('OS')}
          value={os}
        />
      </div>
    </div>
  );
};

AboutModal.propTypes = {
  buildNumber: PropTypes.string,
  versionNumber: PropTypes.string,
};

export default AboutModal;
