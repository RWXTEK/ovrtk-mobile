// lib/vinDecoder.ts
// VIN Decoder using FREE NHTSA API

export interface VehicleSpecs {
    vin: string;
    year: number;
    make: string;
    model: string;
    trim?: string;
    bodyClass?: string;
    engineCylinders?: string;
    engineDisplacement?: string;
    engineHP?: string;
    engineConfiguration?: string;
    transmissionStyle?: string;
    transmissionSpeeds?: string;
    driveType?: string;
    fuelType?: string;
    doors?: string;
    seats?: string;
    vehicleType?: string;
    plantCity?: string;
    plantCountry?: string;
    manufacturerName?: string;
    series?: string;
    wheelbase?: string;
    gvwr?: string;
  }
  
  export interface Recall {
    nhtsaId: string;
    component: string;
    summary: string;
    consequence: string;
    remedy: string;
    reportedDate: string;
  }
  
  export interface VINDecodeResult {
    success: boolean;
    specs?: VehicleSpecs;
    recalls?: Recall[];
    error?: string;
  }
  
  /**
   * Validate VIN format (17 characters, no I, O, Q)
   */
  export function isValidVIN(vin: string): boolean {
    if (!vin || vin.length !== 17) return false;
    
    // VINs don't contain I, O, Q to avoid confusion with 1, 0
    const invalidChars = /[IOQ]/i;
    if (invalidChars.test(vin)) return false;
    
    // Only alphanumeric
    const validFormat = /^[A-HJ-NPR-Z0-9]{17}$/i;
    return validFormat.test(vin);
  }
  
  /**
   * Decode VIN using NHTSA API
   * @param vin - 17-character VIN
   * @param userTier - User subscription tier (for logging/analytics)
   */
  export async function decodeVIN(
    vin: string,
    userTier?: 'FREE' | 'PLUS' | 'TRACK_MODE' | 'CLUB'
  ): Promise<VINDecodeResult> {
    try {
      // Validate VIN
      if (!isValidVIN(vin)) {
        return {
          success: false,
          error: 'Invalid VIN format. VIN must be 17 characters (letters and numbers, no I, O, or Q).',
        };
      }
  
      console.log('[VIN] Decoding:', vin, 'Tier:', userTier);
  
      // Call NHTSA API
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`;
      const response = await fetch(url);
  
      if (!response.ok) {
        throw new Error(`NHTSA API error: ${response.status}`);
      }
  
      const data = await response.json();
  
      // Parse results
      const results = data.Results || [];
      const getValue = (variable: string): string | undefined => {
        const item = results.find((r: any) => r.Variable === variable);
        return item?.Value || undefined;
      };
  
      // Build specs object
      const specs: VehicleSpecs = {
        vin: vin.toUpperCase(),
        year: parseInt(getValue('Model Year') || '0'),
        make: getValue('Make') || 'Unknown',
        model: getValue('Model') || 'Unknown',
        trim: getValue('Trim'),
        series: getValue('Series'),
        bodyClass: getValue('Body Class'),
        vehicleType: getValue('Vehicle Type'),
        doors: getValue('Doors'),
        seats: getValue('Seating Rows') || getValue('Seats'),
        engineCylinders: getValue('Engine Number of Cylinders'),
        engineDisplacement: getValue('Displacement (L)'),
        engineHP: getValue('Engine Brake (hp)'),
        engineConfiguration: getValue('Engine Configuration'),
        transmissionStyle: getValue('Transmission Style'),
        transmissionSpeeds: getValue('Transmission Speeds'),
        driveType: getValue('Drive Type'),
        fuelType: getValue('Fuel Type - Primary'),
        wheelbase: getValue('Wheelbase (inches)'),
        gvwr: getValue('Gross Vehicle Weight Rating (GVWR)'),
        plantCity: getValue('Plant City'),
        plantCountry: getValue('Plant Country'),
        manufacturerName: getValue('Manufacturer Name'),
      };
  
      console.log('[VIN] Decode successful:', specs);
  
      // Get recalls
      const recalls = await getRecalls(vin);
  
      return {
        success: true,
        specs,
        recalls,
      };
    } catch (error) {
      console.error('[VIN] Decode failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to decode VIN',
      };
    }
  }
  
  /**
   * Get recalls for a VIN using NHTSA API
   */
  export async function getRecalls(vin: string): Promise<Recall[]> {
    try {
      console.log('[VIN] Fetching recalls:', vin);
  
      const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&year=&vin=${vin}`;
      const response = await fetch(url);
  
      if (!response.ok) {
        console.warn('[VIN] Recalls API error:', response.status);
        return [];
      }
  
      const data = await response.json();
      const results = data.results || [];
  
      const recalls: Recall[] = results.map((r: any) => ({
        nhtsaId: r.NHTSACampaignNumber || '',
        component: r.Component || '',
        summary: r.Summary || '',
        consequence: r.Consequence || '',
        remedy: r.Remedy || '',
        reportedDate: r.ReportReceivedDate || '',
      }));
  
      console.log('[VIN] Found', recalls.length, 'recalls');
      return recalls;
    } catch (error) {
      console.error('[VIN] Failed to fetch recalls:', error);
      return [];
    }
  }
  
  /**
   * Format VIN decode results for Scotty's response
   */
  export function formatVINResponse(result: VINDecodeResult): string {
    if (!result.success || !result.specs) {
      return result.error || 'Failed to decode VIN.';
    }
  
    const { specs, recalls } = result;
  
    let response = `🚗 **VIN Decoded: ${specs.year} ${specs.make} ${specs.model}**\n`;
    if (specs.trim) response += `*${specs.trim}*\n`;
    response += `\n`;
  
    // Basic info
    response += `📋 **Vehicle Specs:**\n`;
    if (specs.bodyClass) response += `• Body: ${specs.bodyClass}\n`;
    if (specs.doors) response += `• Doors: ${specs.doors}\n`;
    
    // Engine (more detailed)
    response += `\n🔧 **Engine & Performance:**\n`;
    if (specs.engineDisplacement || specs.engineCylinders || specs.engineHP) {
      response += `• Engine: `;
      if (specs.engineDisplacement) response += `${specs.engineDisplacement}L `;
      if (specs.engineCylinders) response += `${specs.engineCylinders}-cylinder`;
      response += `\n`;
      if (specs.engineHP) response += `• Horsepower: ${specs.engineHP} hp\n`;
    }
    if (specs.fuelType) response += `• Fuel Type: ${specs.fuelType}\n`;
  
    // Transmission & Drive
    response += `\n⚙️ **Drivetrain:**\n`;
    if (specs.transmissionStyle) response += `• Transmission: ${specs.transmissionStyle}\n`;
    if (specs.driveType) response += `• Drive Type: ${specs.driveType}\n`;
    
    // Manufacturing
    if (specs.plantCity || specs.plantCountry || specs.manufacturerName) {
      response += `\n🏭 **Manufacturing:**\n`;
      if (specs.manufacturerName) response += `• Made by: ${specs.manufacturerName}\n`;
      if (specs.plantCity && specs.plantCountry) {
        response += `• Built in: ${specs.plantCity}, ${specs.plantCountry}\n`;
      } else if (specs.plantCountry) {
        response += `• Built in: ${specs.plantCountry}\n`;
      }
    }
  
    // Recalls
    response += `\n`;
    if (recalls && recalls.length > 0) {
      response += `🚨 **OPEN RECALLS (${recalls.length}):**\n`;
      recalls.forEach((recall, index) => {
        response += `\n${index + 1}. **${recall.component}**\n`;
        response += `   ${recall.summary}\n`;
        response += `   ⚠️ Risk: ${recall.consequence}\n`;
        response += `   ✅ Fix: ${recall.remedy}\n`;
      });
      response += `\n→ **Get these fixed FREE at any authorized dealer!**\n`;
    } else {
      response += `✅ **No Open Recalls** - You're all clear!\n`;
    }
  
    // Disclaimer
    response += `\n`;
    response += `💡 *This data comes from the NHTSA database. For complete vehicle history, consider a full report.*`;
  
    return response;
  }
  
  /**
   * Extract VIN from user message
   */
  export function extractVIN(message: string): string | null {
    // Look for 17-character alphanumeric string
    const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
    const match = message.match(vinPattern);
    return match ? match[0].toUpperCase() : null;
  }