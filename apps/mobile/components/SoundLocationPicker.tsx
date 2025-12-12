import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg: "#0C0D11",
  panel: "#121318",
  line: "#1E2127",
  text: "#E7EAF0",
  muted: "#A6ADBB",
  accent: "#E11D48",
};

interface SoundLocationPickerProps {
  visible: boolean;
  onSelectLocation: (location: string) => void;
  onClose: () => void;
}

const LOCATIONS = [
  {
    id: 'engine',
    label: 'Engine / Under Hood',
    icon: 'hardware-chip' as const,
    description: 'Belts, pulleys, timing chain, valves',
    color: '#E11D48',
  },
  {
    id: 'wheels_brakes',
    label: 'Wheels / Brakes',
    icon: 'radio-button-on' as const,
    description: 'Bearings, pads, rotors, calipers',
    color: '#F97316',
  },
  {
    id: 'suspension',
    label: 'Suspension / Under Car',
    icon: 'git-merge' as const,
    description: 'Shocks, struts, bushings, control arms',
    color: '#EAB308',
  },
  {
    id: 'exhaust',
    label: 'Exhaust System',
    icon: 'cloud' as const,
    description: 'Manifold, catalytic, muffler, hangers',
    color: '#06B6D4',
  },
  {
    id: 'unknown',
    label: 'Not Sure',
    icon: 'help-circle' as const,
    description: "I'll let Scotty figure it out",
    color: '#8B5CF6',
  },
];

export default function SoundLocationPicker({
  visible,
  onSelectLocation,
  onClose,
}: SoundLocationPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="location" size={28} color={C.accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Where's the sound?</Text>
              <Text style={styles.subtitle}>
                This helps Scotty diagnose more accurately
              </Text>
            </View>
          </View>

          {/* Location Options */}
          <ScrollView 
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {LOCATIONS.map((location, index) => (
              <TouchableOpacity
                key={location.id}
                style={[
                  styles.locationCard,
                  index === LOCATIONS.length - 1 && styles.locationCardLast,
                ]}
                onPress={() => {
                  onSelectLocation(location.id);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View 
                  style={[
                    styles.locationIcon,
                    { backgroundColor: `${location.color}20` }
                  ]}
                >
                  <Ionicons 
                    name={location.icon} 
                    size={28} 
                    color={location.color} 
                  />
                </View>
                
                <View style={styles.locationContent}>
                  <Text style={styles.locationLabel}>{location.label}</Text>
                  <Text style={styles.locationDescription}>
                    {location.description}
                  </Text>
                </View>

                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={C.muted} 
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: C.panel,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: C.line,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: `${C.accent}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 18,
  },
  scrollView: {
    maxHeight: 400,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  locationCardLast: {
    borderBottomWidth: 0,
  },
  locationIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  locationDescription: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 17,
  },
  cancelButton: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  cancelButtonText: {
    color: C.muted,
    fontSize: 16,
    fontWeight: '700',
  },
});