/**
 * RegisterPage.test.tsx
 * Verifies: submitting the empty registration form surfaces validation messages (full name,
 * email, password, agree-to-terms) without ever calling the API.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { post: vi.fn() } }));

import { apiClient } from '../../../lib/apiClient/apiClient';

describe('RegisterPage', () => {
  it('shows validation messages for every required field and never calls the API', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/full name must be at least/i)).toBeInTheDocument();
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least/i)).toBeInTheDocument();
    expect(await screen.findByText(/please fix the highlighted fields/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
