import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { supabase } from '../../lib/supabase';

type Props = {
  onSwitch: () => void;
};

export default function LoginScreen({ onSwitch }: Props) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!usernameOrEmail || !password) {
      Alert.alert('Please fill in all fields');
      return;
    }
    setLoading(true);

    let email = usernameOrEmail.trim();

    // If it doesn't look like an email, look up by username
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('get_email_by_username', { p_username: email });
      if (error || !data) {
        setLoading(false);
        Alert.alert('Login failed', 'No account found with that username.');
        return;
      }
      email = data;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>slow meter</Text>
      <Text style={styles.subtitle}>a quieter place to share</Text>

      <TextInput
        style={styles.input}
        placeholder="Username or email"
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
        value={usernameOrEmail}
        onChangeText={setUsernameOrEmail}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Log in</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitch} style={styles.switchLink}>
        <Text style={styles.switchText}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#fafaf8',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  title: { fontSize: 36, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, letterSpacing: -1 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 48 },
  input: {
    width: '100%', height: 50, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12, color: '#1a1a1a',
  },
  button: {
    width: '100%', height: 50, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  passwordRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, marginBottom: 12,
  },
  passwordInput: { flex: 1, height: 50, paddingHorizontal: 16, fontSize: 16, color: '#1a1a1a' },
  eyeBtn: { paddingHorizontal: 14 },
  eyeText: { fontSize: 18 },
  switchLink: { marginTop: 24 },
  switchText: { color: '#666', fontSize: 14 },
});
