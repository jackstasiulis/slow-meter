import React from 'react';
import { useNavigation } from '@react-navigation/native';
import EditProfilePanel from '../components/profile/EditProfilePanel';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();

  return (
    <EditProfilePanel
      presentation="fullscreen"
      onClose={() => navigation.goBack()}
      onSaved={() => navigation.goBack()}
    />
  );
}
