import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { BrandProfileButton } from './BrandProfileButton';

type Props = {
  initial: string;
  dark?: boolean;
  size?: number;
};

export function ProfileQuickAccessButton({ initial, dark = false, size }: Props) {
  const router = useRouter();
  const { userProfile } = useAuth();

  return (
    <BrandProfileButton
      initial={initial}
      dark={dark}
      size={size}
      photoURL={userProfile?.photoURL}
      onPress={() => router.push('/settings' as any)}
      accessibilityLabel="Open settings"
    />
  );
}
