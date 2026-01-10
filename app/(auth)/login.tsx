import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const { login } = useAuth();
const router = useRouter();

const handleLogin = async () => {
if (!email || !password) {
Alert.alert('Error', 'Please fill in all fields');
return;
}

setLoading(true);
try {
await login(email, password);
router.replace('/(tabs)');
} catch (error: any) {
Alert.alert('Login Failed', error.message);
} finally {
setLoading(false);
}
};

return (
<View style={styles.container}>
<View style={styles.header}>
<Text style={styles.logo}>Sideline</Text>
<Text style={styles.tagline}>Connect with fans worldwide</Text>
</View>

<View style={styles.form}>
<View style={styles.inputContainer}>
<Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
<TextInput
style={styles.input}
placeholder="Email"
value={email}
onChangeText={setEmail}
keyboardType="email-address"
autoCapitalize="none"
placeholderTextColor="#999"
/>
</View>

<View style={styles.inputContainer}>
<Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
<TextInput
style={styles.input}
placeholder="Password"
value={password}
onChangeText={setPassword}
secureTextEntry
placeholderTextColor="#999"
/>
</View>

<TouchableOpacity
style={[styles.button, loading && styles.buttonDisabled]}
onPress={handleLogin}
disabled={loading}
>
<Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
</TouchableOpacity>

<TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
<Text style={styles.link}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
</TouchableOpacity>
</View>
</View>
);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#FFFFFF',
justifyContent: 'center',
paddingHorizontal: 30,
},
header: {
alignItems: 'center',
marginBottom: 50,
},
logo: {
fontSize: 48,
fontWeight: '800',
color: '#0066CC',
marginBottom: 10,
},
tagline: {
fontSize: 16,
color: '#666',
},
form: {
width: '100%',
},
inputContainer: {
flexDirection: 'row',
alignItems: 'center',
backgroundColor: '#F5F5F7',
borderRadius: 12,
paddingHorizontal: 15,
marginBottom: 15,
},
inputIcon: {
marginRight: 10,
},
input: {
flex: 1,
paddingVertical: 15,
fontSize: 16,
color: '#000',
},
button: {
backgroundColor: '#0066CC',
borderRadius: 12,
paddingVertical: 16,
alignItems: 'center',
marginTop: 10,
},
buttonDisabled: {
opacity: 0.6,
},
buttonText: {
color: '#FFFFFF',
fontSize: 17,
fontWeight: '700',
},
link: {
textAlign: 'center',
color: '#666',
fontSize: 15,
marginTop: 20,
},
linkBold: {
color: '#0066CC',
fontWeight: '700',
},
});