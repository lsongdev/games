import { Mapper4 } from './mapper4.js';
import { ICartridge } from '../api/cartridge.js';
export declare class Mapper187 extends Mapper4 {
    constructor(cartridge: ICartridge, ram: Uint8Array, prg: Uint8Array, chr: Uint8Array);
}
