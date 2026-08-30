import { fourUp } from './hps/fourUp';
import { main3D } from './hps/main3D';
import { mpr } from './hps/mpr';
import { mprAnd3DVolumeViewport } from './hps/mprAnd3DVolumeViewport';
import { only3D } from './hps/only3D';
import { primary3D } from './hps/primary3D';
import { primaryAxial } from './hps/primaryAxial';
import { frameView } from './hps/frameView';
import { frameView3x3 } from './hps/frameView3x3';
import { frameView4x4 } from './hps/frameView4x4';
import { preferiti } from './hps/preferiti';
import { mdvHP } from './hps/mdvHP';

function getHangingProtocolModule() {
  return [
    {
      name: mpr.id,
      protocol: mpr,
    },
    {
      name: mprAnd3DVolumeViewport.id,
      protocol: mprAnd3DVolumeViewport,
    },
    {
      name: fourUp.id,
      protocol: fourUp,
    },
    {
      name: main3D.id,
      protocol: main3D,
    },
    {
      name: primaryAxial.id,
      protocol: primaryAxial,
    },
    {
      name: only3D.id,
      protocol: only3D,
    },
    {
      name: primary3D.id,
      protocol: primary3D,
    },
    // {
    //   name: frameView.id,
    //   protocol: frameView,
    // },
    // {
    //   name: frameView3x3.id,
    //   protocol: frameView3x3,
    // },
    // {
    //   name: frameView4x4.id,
    //   protocol: frameView4x4,
    // },
    // {
    //   name: preferiti.id,
    //   protocol: preferiti,
    // },
    // {
    //   name: mdvHP.id,
    //   protocol: mdvHP,
    // },
  ];
}

export default getHangingProtocolModule;
