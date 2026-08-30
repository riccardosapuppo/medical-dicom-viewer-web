const defaultContextMenu = {
  id: 'measurementsContextMenu',
  customizationType: 'ohif.contextMenu',
  menus: [
    // Get the items from the UI Customization for the menu name (and have a custom name)
    {
      id: 'forExistingMeasurement',
      selector: ({ nearbyToolData }) => !!nearbyToolData,
      items: [
        {
          label: 'Elimina misurazione',
          commands: [
            {
              commandName: 'deleteMeasurement',
              // we only have support for cornerstoneTools context menu since
              // they are svg based
              context: 'CORNERSTONE',
            },
          ],
        },
        {
          label: 'Aggiungi etichetta',
          commands: [
            {
              commandName: 'setMeasurementLabel',
            },
          ],
        },
      ],
    },
  ],
};

export default defaultContextMenu;
