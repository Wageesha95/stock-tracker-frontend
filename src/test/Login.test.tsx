import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../api', () => ({
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn().mockRejectedValue(new Error('not logged in')),
}));

function renderLogin() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('Login', () => {
  it('renders login form with title and button', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByText('Stock Tracker')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders username and password inputs', async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByText('Username')).toBeInTheDocument();
    });
    expect(screen.getByText('Password')).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const { login } = await import('../api');
    (login as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'));

    renderLogin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'bad' } });
    // Password input is type="password" so not a textbox
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
  });
});
