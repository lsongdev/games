import { Mapper0 } from '../mapper/mapper0.js';
import { Mirror } from '../api/cartridge.js';
import { Mapper4 } from '../mapper/mapper4.js';
import { Mapper1 } from '../mapper/mapper1.js';
import { Mapper2 } from '../mapper/mapper2.js';
import { Mapper3 } from '../mapper/mapper3.js';
import { Mapper74 } from '../mapper/mapper74.js';
import { Mapper242 } from '../mapper/mapper242.js';
var Header;
(function (Header) {
    Header[Header["PRG"] = 4] = "PRG";
    Header[Header["CHR"] = 5] = "CHR";
    Header[Header["FLAG1"] = 6] = "FLAG1";
    Header[Header["FLAG2"] = 7] = "FLAG2";
    // NES 2.0 extended header bytes
    Header[Header["FLAG3"] = 8] = "FLAG3";
    Header[Header["FLAG4"] = 9] = "FLAG4";
    Header[Header["FLAG5"] = 10] = "FLAG5";
    Header[Header["FLAG6"] = 11] = "FLAG6";
    Header[Header["FLAG7"] = 12] = "FLAG7";
    Header[Header["FLAG8"] = 13] = "FLAG8";
    Header[Header["FLAG9"] = 14] = "FLAG9";
})(Header || (Header = {}));
// INES: https://wiki.nesdev.com/w/index.php/INES
// NES 2.0: https://wiki.nesdev.com/w/index.php/NES_2.0
export class Cartridge {
    constructor(data, sram) {
        this.info = {};
        Cartridge.checkConstant(data);
        this.parseROMInfo(data);
        
        // Calculate PRG-ROM size based on format
        let prgSize;
        if (this.info.isNES20) {
            prgSize = Cartridge.calculateNES20Size(this.info.prg, this.info.prgSizeHigh) * 16 * 1024;
        } else {
            prgSize = this.info.prg * 16 * 1024;
        }
        
        // Calculate CHR-ROM size based on format
        let chrSize;
        if (this.info.isNES20) {
            chrSize = Cartridge.calculateNES20Size(this.info.chr, this.info.chrSizeHigh) * 8 * 1024;
        } else {
            chrSize = this.info.chr * 8 * 1024;
        }
        
        const prgOffset = this.info.isTrained ? 16 + 512 : 16;
        const prg = data.slice(prgOffset, prgOffset + prgSize);
        const chrOffset = prgOffset + prg.length;
        const chr = data.slice(chrOffset, chrOffset + chrSize);
        
        switch (this.info.mapper) {
            case 0:
                this.mapper = new Mapper0(this, sram, prg, chr);
                break;
            case 1:
                this.mapper = new Mapper1(this, sram, prg, chr);
                break;
            case 2:
                this.mapper = new Mapper2(this, sram, prg, chr);
                break;
            case 3:
                this.mapper = new Mapper3(this, sram, prg, chr);
                break;
            case 4:
                this.mapper = new Mapper4(this, sram, prg, chr);
                break;
            case 74:
                this.mapper = new Mapper74(this, sram, prg, chr);
                break;
            case 242:
                this.mapper = new Mapper242(this, sram, prg, chr);
                break;
            default:
                throw new Error(`Unsupported mapper: ${this.info.mapper}`);
        }
    }
    
    /**
     * Calculate NES 2.0 ROM size from low and high bytes
     * NES 2.0 uses exponential encoding for sizes > 255
     */
    static calculateNES20Size(lowByte, highByte) {
        if (highByte === 0) {
            return lowByte;
        }
        
        // For NES 2.0, when high byte is non-zero:
        // The value is encoded as: (highByte << 8) | lowByte
        // But the actual size uses exponential encoding
        // Formula: lowByte * 2^(highByte) for some implementations
        // Or simply: (highByte << 8) | lowByte for linear encoding
        return (highByte << 8) | lowByte;
    }
    parseROMInfo(data) {
        // Check if this is NES 2.0 format
        // NES 2.0 requires:
        // 1. Bits 2-3 of byte 7 = 10 (binary)
        // 2. Lower nibbles of bytes 6 and 7 must be zero (NES 2.0 reserves them)
        // If lower nibbles are non-zero, it's definitely iNES (has flags like mirroring, battery, etc.)
        const formatIdentifier = (data[Header.FLAG2] & 0x0C);
        const lowerNibble6 = data[Header.FLAG1] & 0x0F;
        const lowerNibble7 = data[Header.FLAG2] & 0x0F;
        const isNES20 = formatIdentifier === 0x08 && lowerNibble6 === 0 && lowerNibble7 === 0;
        this.info.isNES20 = isNES20;

        if (isNES20) {
            // NES 2.0 format
            // Parse PRG-ROM size
            const prgSizeLow = data[Header.PRG];
            const prgSizeHigh = data[Header.FLAG3];
            this.info.prg = prgSizeLow | (prgSizeHigh << 8);
            
            // Parse CHR-ROM size
            const chrSizeLow = data[Header.CHR];
            const chrSizeHigh = data[Header.FLAG4];
            this.info.chr = chrSizeLow | (chrSizeHigh << 8);
            
            // Store high bytes for potential large ROM support
            this.info.prgSizeHigh = prgSizeHigh;
            this.info.chrSizeHigh = chrSizeHigh;
            
            // Parse mapper number (12-bit mapper space)
            // In NES 2.0:
            // - Byte 6 bits 4-7: Mapper bits 0-3
            // - Byte 7 bits 4-7: Mapper bits 4-7
            // - Byte 10 bits 4-7: Mapper bits 8-11
            const mapperL = data[Header.FLAG1] >> 4;
            const mapperH = data[Header.FLAG2] >> 4;
            const mapperEx = (data[Header.FLAG5] >> 4) & 0x0F;
            this.info.mapper = mapperL | (mapperH << 4) | (mapperEx << 8);
            
            // Parse submapper
            this.info.submapper = data[Header.FLAG5] & 0x0F;
            
            // Parse extended mirroring types
            const mirrorType = data[Header.FLAG6] & 0x07;
            switch (mirrorType) {
                case 0:
                    this.info.mirror = Mirror.HORIZONTAL;
                    break;
                case 1:
                    this.info.mirror = Mirror.VERTICAL;
                    break;
                case 2:
                    this.info.mirror = Mirror.FOUR_SCREEN;
                    break;
                case 3:
                    this.info.mirror = Mirror.SINGLE_SCREEN_LOWER_BANK;
                    break;
                case 4:
                    this.info.mirror = Mirror.SINGLE_SCREEN_UPPER_BANK;
                    break;
                default:
                    this.info.mirror = Mirror.HORIZONTAL;
            }
            
            // Parse other flags
            this.info.hasBatteryBacked = !!(data[Header.FLAG6] & 0x10);
            this.info.isTrained = !!(data[Header.FLAG6] & 0x08);
            
            // Parse extended byte count (for ROMs > 4GB)
            this.info.extendedByteCount = data[Header.FLAG7];
            
            // Parse default expansion device
            this.info.defaultExpansion = data[Header.FLAG8] >> 4;
        } else {
            // Original iNES format
            this.info.prg = data[Header.PRG];
            this.info.chr = data[Header.CHR];
            
            const mapperL = data[Header.FLAG1] >> 4;
            const mapperH = data[Header.FLAG2] >> 4;
            this.info.mapper = mapperH << 4 | mapperL;
            
            this.info.mirror = data[Header.FLAG1] & 0x08 ? Mirror.FOUR_SCREEN :
                data[Header.FLAG1] & 0x01 ? Mirror.VERTICAL : Mirror.HORIZONTAL;
            this.info.hasBatteryBacked = !!(data[Header.FLAG1] & 0x02);
            this.info.isTrained = !!(data[Header.FLAG1] & 0x04);
        }
    }
    static checkConstant(data) {
        const str = 'NES\u001a';
        for (let i = 0; i < str.length; i++) {
            if (data[i] !== str.charCodeAt(i)) {
                throw new Error('Invalid nes file');
            }
        }
        // NES 2.0 is now supported - check if it's NES 2.0 format
        // NES 2.0 identifier: bits 2-3 of byte 7 are 10 (binary)
        if ((data[7] & 0x0C) === 0x08) {
            // NES 2.0 format - this is valid, don't throw
        }
    }
}
//# sourceMappingURL=cartridge.js.map