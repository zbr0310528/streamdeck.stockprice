# Stream Deck 中国股票价格插件

实时显示中国股票、黄金、期货及大盘指数价格的 Stream Deck 插件。

## 功能特性

- 📈 **股票价格**：支持沪深主板、创业板、科创板
- 🪙 **黄金/期货**：国际金价、国内金价、银、铜等
- 📊 **大盘指数**：上证指数、深成指、创业板、沪深300等
- ⏱️ **自动刷新**：每5秒自动更新数据

## 支持的代码

### 大盘指数
| 代码 | 名称 |
|------|------|
| 000001 | 上证指数 |
| 399001 | 深成指 |
| 399006 | 创业板 |
| 000300 | 沪深300 |
| 000016 | 上证50 |
| 000688 | 科创50 |

### 股票
- 沪市：600xxx、601xxx、603xxx、605xxx、688xxx
- 深市：000xxx、001xxx、002xxx、003xxx、300xxx

### 黄金/期货
| 代码 | 名称 |
|------|------|
| GC | 国际黄金（美元/盎司） |
| AU0 | 沪金主力（人民币/克） |
| AG0 | 沪银主力（人民币/克） |
| CU0 | 沪铜主力（人民币/吨） |
| AU99.99 | 金99.99（人民币/克） |

## 安装

### 方式一：直接安装（推荐）

1. 下载 `.streamDeckPlugin` 文件
2. 双击或在 Stream Deck 软件中导入
3. 重启 Stream Deck 软件

### 方式二：源码安装

```bash
# 克隆仓库
git clone <repository-url>
cd stream-deck-stock-plugin/v2

# 安装依赖
npm install

# 构建
npm run build

# 打包
zip -r com.gdby.stockprice.streamDeckPlugin com.gdby.stockprice.sdPlugin/*

# 安装插件（Windows）
# 将 com.gdby.stockprice.streamDeckPlugin 复制到 %AppData%\Elgato\StreamDeck\Plugins\

# 重启 Stream Deck 软件
```

## 使用方法

1. 在 Stream Deck 按钮列表中找到「中国股票价格」
2. 拖动到需要的位置
3. 点击按钮，在弹出窗口中：
   - 选择类型（股票/大盘指数/黄金）
   - 输入代码
4. 点击保存

## 数据来源

数据来自新浪财经 API。

## 系统要求

- Windows 10 及以上
- Stream Deck 软件 6.5 及以上
- Node.js 20（仅开发需要）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监视文件变化）
npm run watch

# 构建
npm run build
```

## 许可证

MIT
