import extension from '../extensions/radiology-workflow/src';

export function App() {
  const [{ component: Workflow }] = extension.getLayoutTemplateModule();

  return <Workflow />;
}
