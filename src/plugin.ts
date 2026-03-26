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

const COLOR_UP = "#FFCCCC";
const COLOR_DOWN = "#CCFFCC";
const COLOR_NEUTRAL = "#EEEEEE";

function createColorPngDataUrl(hexColor: string): string {
	const width = 144;
	const height = 144;

	const r = parseInt(hexColor.slice(1, 3), 16);
	const g = parseInt(hexColor.slice(3, 5), 16);
	const b = parseInt(hexColor.slice(5, 7), 16);

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

	private async updateDisplay(action: KeyAction<StockSettings>, settings: StockSettings): Promise<void> {
		const { stockCode, assetType } = settings;

		if (!stockCode) {
			await action.setTitle("请配置\n代码");
			return;
		}

		if (assetType === "index") {
			const indexData = await this.fetchIndexPrice(stockCode);
			if (!indexData) {
				await action.setTitle(stockCode + "\n获取失败");
				return;
			}

			const price = indexData.price.toFixed(2);
			const change = indexData.changePercent;
			const changeSymbol = change >= 0 ? "+" : "";

			const title = indexData.name + "\n" + price + "\n" + changeSymbol + change.toFixed(2) + "%";
			await action.setTitle(title);
			await action.setImage(createColorPngDataUrl(this.getColorForChange(change)));
		} else if (assetType === "gold") {
			const goldData = await this.fetchGoldPrice(stockCode);
			if (!goldData) {
				await action.setTitle(stockCode + "\n获取失败");
				return;
			}

			const price = goldData.price.toFixed(2);
			const change = goldData.changePercent;
			const changeSymbol = change >= 0 ? "+" : "";
			const unit = goldData.unit === "USD" ? "$" : "¥";

			const title = goldData.name + "\n" + unit + price + "\n" + changeSymbol + change.toFixed(2) + "%";
			await action.setTitle(title);
			await action.setImage(createColorPngDataUrl(this.getColorForChange(change)));
		} else {
			const stockData = await this.fetchStockPrice(stockCode);
			if (!stockData) {
				await action.setTitle(stockCode + "\n获取失败");
				return;
			}

			const price = stockData.price.toFixed(2);
			const changePercent = stockData.close > 0
				? ((stockData.price - stockData.close) / stockData.close * 100)
				: 0;
			const changeSymbol = changePercent >= 0 ? "+" : "";

			const title = stockData.name + "\n¥" + price + "\n" + changeSymbol + changePercent.toFixed(2) + "%";
			await action.setTitle(title);
			await action.setImage(createColorPngDataUrl(this.getColorForChange(changePercent)));
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
				namePrefix = "沪金";
			} else if (code === "AG0") {
				fullCode = "nf_AG0";
				unit = "CNY";
				namePrefix = "沪银";
			} else if (code === "CU0") {
				fullCode = "nf_CU0";
				unit = "CNY";
				namePrefix = "沪铜";
			} else if (code === "AU99.99") {
				fullCode = "gpc_AU99.99";
				unit = "CNY";
				namePrefix = "金99.99";
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
				const chunks: Buffer[] = [];
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