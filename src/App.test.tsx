import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('application scaffold', () => {
  it('registers the radiology workflow extension and mode', () => {
    render(<App />);

    expect(screen.getByText('Radiology Workflow Viewer')).toBeInTheDocument();
    expect(screen.getByText(/Synthetic worklist loading/)).toBeInTheDocument();
  });
});

