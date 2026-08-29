import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('application scaffold', () => {
  it('registers the radiology workflow extension and mode', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('heading', { name: 'Study worklist' })).toBeInTheDocument();
    expect(container.querySelector('.worklist-summary')).toHaveTextContent('8 matching studies');
  });
});
