import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const C = {
  bg: '#0C0D11',
  panel: '#121318',
  line: '#1E2127',
  text: '#E7EAF0',
  muted: '#A6ADBB',
  accent: '#E11D48',
  dim: '#0f1218',
};

export type VehicleType = 'car' | 'motorcycle' | 'truck' | 'offroad' | 'marine' | 'other';

interface VehicleOption {
  type: VehicleType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  {
    type: 'car',
    label: 'Car',
    icon: 'car-sport',
    description: 'Sedans, coupes, sports cars, etc.',
  },
  {
    type: 'motorcycle',
    label: 'Motorcycle',
    icon: 'bicycle',
    description: 'Sport bikes, cruisers, touring bikes',
  },
  {
    type: 'truck',
    label: 'Truck',
    icon: 'car',
    description: 'Pickups, semi trucks, work trucks',
  },
  {
    type: 'offroad',
    label: 'Off-Road',
    icon: 'trail-sign',
    description: 'Dirt bikes, ATVs, UTVs, side-by-sides',
  },
  {
    type: 'marine',
    label: 'Marine',
    icon: 'boat',
    description: 'Boats, jet skis, yachts',
  },
  {
    type: 'other',
    label: 'Other',
    icon: 'construct',
    description: 'RVs, classics, custom builds',
  },
];

interface VehicleTypePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: VehicleType) => void;
}

export default function VehicleTypePicker({ visible, onClose, onSelect }: VehicleTypePickerProps) {
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSelect = (type: VehicleType) => {
    onClose();
    setTimeout(() => onSelect(type), 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            s.sheet,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.handle} />
            <Text style={s.title}>What are you storing?</Text>
            <Text style={s.subtitle}>Choose your vehicle type</Text>
          </View>

          {/* Options */}
          <View style={s.options}>
            {VEHICLE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.type}
                style={s.option}
                onPress={() => handleSelect(option.type)}
                activeOpacity={0.7}
              >
                <View style={s.optionIcon}>
                  <Ionicons name={option.icon} size={24} color={C.accent} />
                </View>

                <View style={s.optionContent}>
                  <Text style={s.optionLabel}>{option.label}</Text>
                  <Text style={s.optionDesc}>{option.description}</Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color={C.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: C.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '600',
  },
  options: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.dim,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 16,
  },
});