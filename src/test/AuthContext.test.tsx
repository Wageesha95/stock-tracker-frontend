import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';

const mockGetMe = vi.fn();

vi.mock('../api', () => ({
  getMe: (...args: any[]) => mockGetMe(...args),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
}));

function TestConsumer() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div>loading</div>;
  if (!user) return <div>no user</div>;
  return (
    <div>
      <span data-testid="username">{user.username}</span>
      <span data-testid="admin">{isAdmin ? 'yes' : 'no'}</span>
    </div>
  );
}

beforeEach(() => {
  mockGetMe.mockReset();
});

describe('AuthContext', () => {
  it('shows no user when getMe fails', async () => {
    mockGetMe.mockRejectedValueOnce(new Error('401'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('no user')).toBeInTheDocument();
    });
  });

  it('sets user when getMe succeeds', async () => {
    mockGetMe.mockResolvedValueOnce({ id: '1', username: 'testuser', role: 'USER' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('username')).toHaveTextContent('testuser');
      expect(screen.getByTestId('admin')).toHaveTextContent('no');
    });
  });

  it('detects admin role', async () => {
    mockGetMe.mockResolvedValueOnce({ id: '2', username: 'admin', role: 'ADMIN' });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin')).toHaveTextContent('yes');
    });
  });
});
