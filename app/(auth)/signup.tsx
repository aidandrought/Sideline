import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { VALIDATION } from '../../constants/config';
import { useAuth } from '../../context/AuthContext';

export default function SignupScreen() {
const [username, setUsername] = useState('');
const [email, setEmail] = useState('');
const [phone, setPhone] = useState('');
const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [loading, setLoading] = useState(false);
const { signup } = useAuth();
const router = useRouter();

const validateForm = () => {
if (!username || !email || !password || !confirmPassword) {
Alert.alert('Error', 'Please fill in all required fields');
return false;
}

if (!VALIDATION.username.pattern.test(username)) {
Alert.alert('Invalid Username', VALIDATION.username.message);
return false;
}

if (username.length < VALIDATION.username.minLength || username.length > VALIDATION.username.maxLength) {
Alert.alert('Invalid Username', VALIDATION.username.message);
return false;
}

if (!VALIDATION.password.pattern.test(password)) {
Alert.alert('Weak Password', VALIDATION.password.message);
return false;
}

if (password !== confirmPassword) {
Alert.alert('Error', 'Passwords do not match');
return false;
}

if (phone && !VALIDATION.phone.pattern.test(phone)) {
Alert.alert('Invalid Phone', VALIDATION.phone.message);
return false;
}

return true;
};

const handleSignup = async () => {
if (!validateForm()) return;

setLoading(true);
try {
await signup(email, password, username, phone);
router.replace('/(tabs)');
} catch (error: any) {
Alert.alert('Signup Failed', error.message);
} finally {
setLoading(false);
}
};

return (
<ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
<View style={styles.header}>
<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
<Ionicons name="chevron-back" size={28} color="#000" />
</TouchableOpacity>
<Text style={styles.logo}>Join Sideline</Text>
<Text style={styles.tagline}>Create your account</Text>
</View>

<View style={styles.form}>
<View style={styles.inputContainer}>
<Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
<TextInput
style={styles.input}
placeholder="Username"
value={username}
onChangeText={setUsername}
autoCapitalize="none"
placeholderTextColor="#999"
/>
</View>

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
<Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
<TextInput
style={styles.input}
placeholder="Phone (optional)"
value={phone}
onChangeText={setPhone}
keyboardType="phone-pad"
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

<View style={styles.inputContainer}>
<Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
<TextInput
style={styles.input}
placeholder="Confirm Password"
value={confirmPassword}
onChangeText={setConfirmPassword}
secureTextEntry
placeholderTextColor="#999"
/>
</View>

<Text style={styles.hint}>
Password must be 8+ characters with uppercase, lowercase, number, and special character
</Text>

<TouchableOpacity
style={[styles.button, loading && styles.buttonDisabled]}
onPress={handleSignup}
disabled={loading}
>
<Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Sign Up'}</Text>
</TouchableOpacity>

<TouchableOpacity onPress={() => router.back()}>
<Text style={styles.link}>Already have an account? <Text style={styles.linkBold}>Log In</Text></Text>
</TouchableOpacity>
</View>
</ScrollView>
);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#FFFFFF',
},
contentContainer: {
paddingHorizontal: 30,
paddingTop: 60,
paddingBottom: 40,
},
header: {
alignItems: 'center',
marginBottom: 40,
},
backButton: {
position: 'absolute',
left: 0,
top: 0,
},
logo: {
fontSize: 36,
fontWeight: '800',
color: '#0066CC',
marginBottom: 8,
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
marginBottom: 12,
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
hint: {
fontSize: 13,
color: '#999',
marginBottom: 20,
paddingHorizontal: 5,
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