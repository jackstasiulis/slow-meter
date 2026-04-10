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
  ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Props = {
  onSwitch: () => void;
};

export default function SignUpScreen({ onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSignUp() {
    if (!email || !username || !password || !confirmPassword) {
      Alert.alert('Please fill in all fields');
      return;
    }
    if (username.length < 3) {
      Alert.alert('Username must be at least 3 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords don\'t match');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      Alert.alert('Check your email', 'We sent you a confirmation link.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>slow meter</Text>
        <Text style={styles.subtitle}>join the quiet</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
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
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSwitch} style={styles.switchLink}>
          <Text style={styles.switchText}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: '#fafaf8',
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
