import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";
import https from "https";
import { TextDecoder } from "util";
import zlib from "zlib";

const SINA_API_URL = "hq.sinajs.cn";
const SINA_API_PATH = "/list=";

type StockSettings = {
	stockCode: string;
	assetType: "stock" | "gold" | "index";
};

const gbkDecoder = new TextDecoder("gbk");

const INDEX_NAMES: Record<string, string> = {
	"000001": "上证指数",
	"399001": "深成指",
	"399006": "创业板",
	"000300": "沪深300",
	"000016": "上证50",
	"000688": "科创50"
};

const COLOR_UP = "#FF0000";
const COLOR_DOWN = "#00AA00";
const COLOR_NEUTRAL = "#666666";
const BG_COLOR = "#222222";

function createTextPng(textLines: string[], textColor: string): string {
	const width = 144;
	const height = 144;
	const lineHeight = 24;
	const startY = 30;

	const r = parseInt(textColor.slice(1, 3), 16);
	const g = parseInt(textColor.slice(3, 5), 16);
	const b = parseInt(textColor.slice(5, 7), 16);

	const rawData = Buffer.alloc(height * (width * 4 + 1));
	for (let y = 0; y < height; y++) {
		rawData[y * (width * 4 + 1)] = 0;
		for (let x = 0; x < width; x++) {
			const offset = y * (width * 4 + 1) + 1 + x * 4;
			rawData[offset] = 34;
			rawData[offset + 1] = 34;
			rawData[offset + 2] = 34;
			rawData[offset + 3] = 255;
		}
	}

	const charWidth = 12;
	const totalWidth = 144;
	const fontChars = new Set(["0","1","2","3","4","5","6","7","8","9","+","-",".","%","¥","$"]);
	textLines.forEach((line, index) => {
		const y = startY + index * lineHeight;
		let x = (totalWidth - line.length * charWidth) / 2;
		if (x < 0) x = 0;

		for (let i = 0; i < line.length && x < width - charWidth; i++) {
			if (fontChars.has(line[i].toUpperCase())) {
				drawChar(rawData, line[i], Math.floor(x), y, r, g, b, width);
				x += charWidth;
			}
		}
	});

	const deflated = zlib.deflateSync(rawData, { level: 9 });

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8;
	ihdrData[9] = 6;

	const chunks: Buffer[] = [];
	chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
	chunks.push(createPngChunk("IHDR", ihdrData));
	chunks.push(createPngChunk("IDAT", deflated));
	chunks.push(createPngChunk("IEND", Buffer.alloc(0)));

	return "data:image/png;base64," + Buffer.concat(chunks).toString("base64");
}

function createColorBgImg(textColor: string): string {
	const width = 144;
	const height = 144;
	const r = parseInt(textColor.slice(1, 3), 16);
	const g = parseInt(textColor.slice(3, 5), 16);
	const b = parseInt(textColor.slice(5, 7), 16);
	const rawData = Buffer.alloc(height * (width * 4 + 1));
	for (let y = 0; y < height; y++) {
		rawData[y * (width * 4 + 1)] = 0;
		for (let x = 0; x < width; x++) {
			const offset = y * (width * 4 + 1) + 1 + x * 4;
			rawData[offset] = r;
			rawData[offset + 1] = g;
			rawData[offset + 2] = b;
			rawData[offset + 3] = 255;
		}
	}
	const deflated = zlib.deflateSync(rawData, { level: 9 });
	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8;
	ihdrData[9] = 6;
	const chunks: Buffer[] = [];
	chunks.push(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
	chunks.push(createPngChunk("IHDR", ihdrData));
	chunks.push(createPngChunk("IDAT", deflated));
	chunks.push(createPngChunk("IEND", Buffer.alloc(0)));
	return "data:image/png;base64," + Buffer.concat(chunks).toString("base64");
}

function drawChar(rawData: Buffer, char: string, x: number, y: number, r: number, g: number, b: number, width: number): void {
	const font5x7: Record<string, number[][]> = {
		"0": [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
		"1": [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
		"2": [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
		"3": [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
		"4": [[0,0,0,1,0],[0,0,1,1,0],[0,1,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
		"5": [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
		"6": [[0,0,1,1,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
		"7": [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,0,0,0],[0,1,0,0,0]],
		"8": [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
		"9": [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,1,1,0,0]],
		"+": [[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0]],
		"-": [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
		"%": [[1,1,0,0,1],[1,1,0,1,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,0,1,1],[1,0,0,1,1]],
		".": [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0]],
		"¥": [[0,1,1,1,0],[1,0,1,0,0],[1,1,1,1,0],[0,0,1,0,0],[0,1,1,1,0],[0,0,0,0,0],[0,1,1,0,0]],
		"$": [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,1,0],[1,0,0,0,1],[0,1,1,1,0]],
	};

	const upperChar = char.toUpperCase();
	const dotMatrix = font5x7[upperChar];

	if (dotMatrix) {
		for (let dy = 0; dy < 7; dy++) {
			for (let dx = 0; dx < 5; dx++) {
				if (dotMatrix[dy][dx]) {
					const px = x + dx;
					const py = y + dy;
					if (px >= 0 && px < width && py >= 0 && py < 144) {
						const offset = py * (width * 4 + 1) + 1 + px * 4;
						rawData[offset] = r;
						rawData[offset + 1] = g;
						rawData[offset + 2] = b;
						rawData[offset + 3] = 255;
					}
				}
			}
		}
	}
}

function createPngChunk(type: string, data: Buffer): Buffer {
	const typeBuffer = Buffer.from(type, "ascii");
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);

	const crcData = Buffer.concat([typeBuffer, data]);
	const crc = crc32(crcData);
	const crcBuffer = Buffer.alloc(4);
	crcBuffer.writeUInt32BE(crc >>> 0, 0);

	return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data: Buffer): number {
	let crc = 0xFFFFFFFF;
	const table = makeCrcTable();
	for (let i = 0; i < data.length; i++) {
		crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
	}
	return crc ^ 0xFFFFFFFF;
}

function makeCrcTable(): number[] {
	const table: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		table[n] = c;
	}
	return table;
}

@action({ UUID: "com.gdby.stockprice.single" })
export class StockPriceAction extends SingletonAction<StockSettings> {
	private intervals: Map<string, NodeJS.Timeout> = new Map();

	override async onWillAppear(ev: WillAppearEvent<StockSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings;
		if (settings.stockCode) {
			this.startUpdating(ev.action, settings);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<StockSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.stopUpdating(ev.action.id);
		const settings = ev.payload.settings;
		if (settings.stockCode) {
			this.startUpdating(ev.action, settings);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<StockSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const settings = ev.payload.settings;
		if (settings.stockCode) {
			await this.updateDisplay(ev.action, settings);
		}
	}

	private startUpdating(action: KeyAction<StockSettings>, settings: StockSettings): void {
		this.updateDisplay(action, settings);
		this.stopUpdating(action.id);
		const intervalId = setInterval(() => this.updateDisplay(action, settings), 5000);
		this.intervals.set(action.id, intervalId);
	}

	private stopUpdating(contextId: string): void {
		const intervalId = this.intervals.get(contextId);
		if (intervalId) {
			clearInterval(intervalId);
			this.intervals.delete(contextId);
		}
	}

	private getColorForChange(change: number): string {
		if (change > 0) return COLOR_UP;
		if (change < 0) return COLOR_DOWN;
		return COLOR_NEUTRAL;
	}

	private formatName(name: string): string {
		if (name.length > 6) {
			return name.substring(0, 6);
		}
		return name;
	}

	private async updateDisplay(action: KeyAction<StockSettings>, settings: StockSettings): Promise<void> {
		const { stockCode, assetType } = settings;

		if (!stockCode) {
			await action.setImage(createColorBgImg(COLOR_NEUTRAL));
			await action.setTitle("无代码");
			return;
		}

		if (assetType === "index") {
			const indexData = await this.fetchIndexPrice(stockCode);
			if (!indexData) {
				await action.setImage(createColorBgImg(COLOR_NEUTRAL));
				await action.setTitle("获取失败");
				return;
			}

			const price = indexData.price.toFixed(3);
			const change = indexData.changePercent;
			const changeSymbol = change >= 0 ? "+" : "";

			const textColor = this.getColorForChange(change);
			await action.setImage(createColorBgImg(textColor));
			await action.setTitle(`${this.formatName(indexData.name)}\n${price}\n${changeSymbol}${change.toFixed(2)}%`);
		} else if (assetType === "gold") {
			const goldData = await this.fetchGoldPrice(stockCode);
			if (!goldData) {
				await action.setImage(createColorBgImg(COLOR_NEUTRAL));
				await action.setTitle("获取失败");
				return;
			}

			const price = goldData.price.toFixed(3);
			const change = goldData.changePercent;
			const changeSymbol = change >= 0 ? "+" : "";
			const unit = goldData.unit === "USD" ? "$" : "¥";

			const textColor = this.getColorForChange(change);
			await action.setImage(createColorBgImg(textColor));
			await action.setTitle(`${this.formatName(goldData.name)}\n${unit}${price}\n${changeSymbol}${change.toFixed(2)}%`);
		} else {
			const stockData = await this.fetchStockPrice(stockCode);
			if (!stockData) {
				await action.setImage(createColorBgImg(COLOR_NEUTRAL));
				await action.setTitle("获取失败");
				return;
			}

			const price = stockData.price.toFixed(3);
			const changePercent = stockData.close > 0
				? ((stockData.price - stockData.close) / stockData.close * 100)
				: 0;
			const changeSymbol = changePercent >= 0 ? "+" : "";

			const textColor = this.getColorForChange(changePercent);
			await action.setImage(createColorBgImg(textColor));
			await action.setTitle(`${this.formatName(stockData.name)}\n¥${price}\n${changeSymbol}${changePercent.toFixed(2)}%`);
		}
	}

	private fetchIndexPrice(code: string): Promise<any> {
		return new Promise((resolve) => {
			let market = "sh";
			let queryCode = code;

			if (code.length === 6 && /^\d{6}$/.test(code)) {
				if (/^(000|001|399)/.test(code)) {
					market = code.startsWith("399") ? "sz" : "sh";
				}
				queryCode = market + code;
			} else {
				queryCode = code;
			}

			const path = SINA_API_PATH + queryCode;

			const options = {
				hostname: SINA_API_URL,
				path: path,
				method: "GET",
				headers: {
					"Referer": "https://finance.sina.com.cn",
					"User-Agent": "Mozilla/5.0"
				}
			};

			const req = https.request(options, (res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const buffer = Buffer.concat(chunks);
					const text = gbkDecoder.decode(buffer);
					const result = this.parseIndexData(text, code);
					resolve(result);
				});
			});

			req.on("error", () => { resolve(null); });
			req.setTimeout(5000, () => { req.destroy(); resolve(null); });
			req.end();
		});
	}

	private parseIndexData(data: string, code: string): any {
		try {
			const match = data.match(/="([^"]+)"/);
			if (!match || !match[1]) return null;
			const parts = match[1].split(",");
			if (parts.length < 10) return null;

			const name = INDEX_NAMES[code] || parts[0];
			const price = parseFloat(parts[1]) || 0;
			const prevClose = parseFloat(parts[2]) || 0;
			const changeValue = price - prevClose;
			const changePercent = prevClose > 0 ? (changeValue / prevClose * 100) : 0;

			return {
				code: code,
				name: name,
				price: price,
				change: changeValue,
				changePercent: changePercent
			};
		} catch (e) {
			return null;
		}
	}

	private fetchGoldPrice(code: string): Promise<any> {
		return new Promise((resolve) => {
			let fullCode = code;
			let unit = "USD";
			let namePrefix = "";

			if (code === "GC") {
				fullCode = "hf_GC";
			} else if (code === "AU0") {
				fullCode = "nf_AU0";
				unit = "CNY";
				namePrefix = "HJ";
			} else if (code === "AG0") {
				fullCode = "nf_AG0";
				unit = "CNY";
				namePrefix = "HY";
			} else if (code === "CU0") {
				fullCode = "nf_CU0";
				unit = "CNY";
				namePrefix = "HT";
			} else if (code === "AU99.99") {
				fullCode = "gpc_AU99.99";
				unit = "CNY";
				namePrefix = "AU99";
			} else {
				fullCode = "hf_" + code;
			}

			const path = SINA_API_PATH + fullCode;

			const options = {
				hostname: SINA_API_URL,
				path: path,
				method: "GET",
				headers: {
					"Referer": "https://finance.sina.com.cn",
					"User-Agent": "Mozilla/5.0"
				}
			};

			const req = https.request(options, (res) => {
				const chunks: Buffer[] =[];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const buffer = Buffer.concat(chunks);
					const text = gbkDecoder.decode(buffer);
					const result = this.parseGoldData(text, code, unit, namePrefix);
					resolve(result);
				});
			});

			req.on("error", () => { resolve(null); });
			req.setTimeout(5000, () => { req.destroy(); resolve(null); });
			req.end();
		});
	}

	private parseGoldData(data: string, code: string, unit: string, namePrefix: string): any {
		try {
			const match = data.match(/="([^"]+)"/);
			if (!match || !match[1]) return null;
			const parts = match[1].split(",");
			if (parts.length < 6) return null;

			const name = namePrefix || parts[0];
			const price = parseFloat(parts[3]) || parseFloat(parts[0]) || 0;
			const prevClose = parseFloat(parts[2]) || parseFloat(parts[1]) || 0;
			const changeValue = price - prevClose;
			const changePercent = prevClose > 0 ? (changeValue / prevClose * 100) : 0;

			return {
				code: code,
				name: name,
				price: price,
				change: changeValue,
				changePercent: changePercent,
				unit: unit
			};
		} catch (e) {
			return null;
		}
	}

	private fetchStockPrice(stockCode: string): Promise<any> {
		return new Promise((resolve) => {
			const market = this.getMarket(stockCode);
			const fullCode = market + stockCode;
			const path = SINA_API_PATH + fullCode;

			const options = {
				hostname: SINA_API_URL,
				path: path,
				method: "GET",
				headers: {
					"Referer": "https://finance.sina.com.cn",
					"User-Agent": "Mozilla/5.0"
				}
			};

			const req = https.request(options, (res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const buffer = Buffer.concat(chunks);
					const text = gbkDecoder.decode(buffer);
					const result = this.parseSinaData(text, stockCode);
					resolve(result);
				});
			});

			req.on("error", () => { resolve(null); });
			req.setTimeout(5000, () => { req.destroy(); resolve(null); });
			req.end();
		});
	}

	private getMarket(stockCode: string): string {
		if (/^(600|601|603|605|688)/.test(stockCode)) return "sh";
		if (/^(000|001|002|003|300|730|740)/.test(stockCode)) return "sz";
		return "sh";
	}

	private parseSinaData(data: string, stockCode: string): any {
		try {
			const match = data.match(/="([^"]+)"/);
			if (!match || !match[1]) return null;
			const parts = match[1].split(",");
			if (parts.length < 32) return null;
			return {
				code: stockCode,
				name: parts[0],
				open: parseFloat(parts[1]) || 0,
				close: parseFloat(parts[2]) || 0,
				price: parseFloat(parts[3]) || 0,
				high: parseFloat(parts[4]) || 0,
				low: parseFloat(parts[5]) || 0,
				volume: parseInt(parts[8]) || 0,
				amount: parseFloat(parts[9]) || 0,
				date: parts[30],
				time: parts[31]
			};
		} catch (e) {
			return null;
		}
	}
}

streamDeck.actions.registerAction(new StockPriceAction());
streamDeck.connect();
