package functions

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/polyspec/template/value"
)

var dayShort = []string{"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
var dayLong = []string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}
var monthShort = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
var monthLong = []string{"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}

var offsetPattern = regexp.MustCompile(`^([+-])(\d{2}):(\d{2})$`)
var dateText = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(Z|[+-]\d{2}:\d{2})?$`)

// ParseOffset returns the offset in seconds of `Z` or `±HH:MM`; ok is false for other text.
func ParseOffset(text string) (int64, bool) {
	if text == "Z" {
		return 0, true
	}
	m := offsetPattern.FindStringSubmatch(text)
	if m == nil {
		return 0, false
	}
	hours, _ := strconv.Atoi(m[2])
	minutes, _ := strconv.Atoi(m[3])
	if hours > 23 || minutes > 59 {
		return 0, false
	}
	offset := int64(hours*3600 + minutes*60)
	if m[1] == "-" {
		offset = -offset
	}
	return offset, true
}

func floorDiv(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

func daysFromCivil(year, month, day int64) int64 {
	y := year
	if month <= 2 {
		y--
	}
	era := floorDiv(y, 400)
	yoe := y - era*400
	mp := (month + 9) % 12
	doy := (153*mp+2)/5 + day - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

func civilFromDays(days int64) (year, month, day int64) {
	z := days + 719468
	era := floorDiv(z, 146097)
	doe := z - era*146097
	yoe := (doe - doe/1460 + doe/36524 - doe/146096) / 365
	y := yoe + era*400
	doy := doe - (365*yoe + yoe/4 - yoe/100)
	mp := (5*doy + 2) / 153
	day = doy - (153*mp+2)/5 + 1
	if mp < 10 {
		month = mp + 3
	} else {
		month = mp - 9
	}
	if month <= 2 {
		y++
	}
	return y, month, day
}

// ToUnixSeconds implements FUN-37.
func ToUnixSeconds(v value.Value, envOffset int64) (int64, error) {
	if f, ok := v.(float64); ok {
		return int64(math.Trunc(f)), nil
	}
	text, ok := value.TextOf(v)
	if !ok {
		return 0, typeError("date requires a number or a string")
	}
	m := dateText.FindStringSubmatch(text)
	if m == nil {
		return 0, typeError("%q is not a date", text)
	}
	year, _ := strconv.ParseInt(m[1], 10, 64)
	month, _ := strconv.ParseInt(m[2], 10, 64)
	day, _ := strconv.ParseInt(m[3], 10, 64)
	var hour, minute, second int64
	if m[4] != "" {
		hour, _ = strconv.ParseInt(m[4], 10, 64)
		minute, _ = strconv.ParseInt(m[5], 10, 64)
		second, _ = strconv.ParseInt(m[6], 10, 64)
	}
	if month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 {
		return 0, typeError("%q is not a date", text)
	}
	offset := envOffset
	if m[7] != "" {
		offset, _ = ParseOffset(m[7])
	}
	return daysFromCivil(year, month, day)*86400 + hour*3600 + minute*60 + second - offset, nil
}

func pad(v int64, width int) string {
	return fmt.Sprintf("%0*d", width, v)
}

// FormatDate implements FUN-40 and FUN-41.
func FormatDate(seconds int64, format string, offset int64) string {
	local := seconds + offset
	days := floorDiv(local, 86400)
	secondOfDay := local - days*86400
	year, month, day := civilFromDays(days)
	hour := secondOfDay / 3600
	minute := (secondOfDay % 3600) / 60
	second := secondOfDay % 60
	weekday := ((days % 7) + 11) % 7
	sign := "+"
	absOffset := offset
	if offset < 0 {
		sign = "-"
		absOffset = -offset
	}
	var b strings.Builder
	for i := 0; i < len(format); i++ {
		switch format[i] {
		case '\\':
			if i+1 < len(format) {
				b.WriteByte(format[i+1])
				i++
			}
		case 'Y':
			b.WriteString(pad(year, 4))
		case 'y':
			b.WriteString(pad(year%100, 2))
		case 'm':
			b.WriteString(pad(month, 2))
		case 'n':
			b.WriteString(strconv.FormatInt(month, 10))
		case 'd':
			b.WriteString(pad(day, 2))
		case 'j':
			b.WriteString(strconv.FormatInt(day, 10))
		case 'H':
			b.WriteString(pad(hour, 2))
		case 'G':
			b.WriteString(strconv.FormatInt(hour, 10))
		case 'i':
			b.WriteString(pad(minute, 2))
		case 's':
			b.WriteString(pad(second, 2))
		case 'D':
			b.WriteString(dayShort[weekday])
		case 'l':
			b.WriteString(dayLong[weekday])
		case 'N':
			if weekday == 0 {
				b.WriteString("7")
			} else {
				b.WriteString(strconv.FormatInt(weekday, 10))
			}
		case 'w':
			b.WriteString(strconv.FormatInt(weekday, 10))
		case 'M':
			b.WriteString(monthShort[month-1])
		case 'F':
			b.WriteString(monthLong[month-1])
		case 'U':
			b.WriteString(strconv.FormatInt(seconds, 10))
		case 'P':
			b.WriteString(sign + pad(absOffset/3600, 2) + ":" + pad((absOffset%3600)/60, 2))
		default:
			b.WriteByte(format[i])
		}
	}
	return b.String()
}

func envOffset(ctx Context) (int64, error) {
	offset, ok := ParseOffset(ctx.Env.Timezone)
	if !ok {
		return 0, typeError("%q is not a time zone offset", ctx.Env.Timezone)
	}
	return offset, nil
}

var dateFunctions = map[string]BuiltIn{
	"date": {2, 2, func(args []value.Value, ctx Context) (value.Value, error) {
		if args[0] == nil {
			return "", nil
		}
		offset, err := envOffset(ctx)
		if err != nil {
			return nil, err
		}
		format, err := argString(args[1], "date")
		if err != nil {
			return nil, err
		}
		seconds, err := ToUnixSeconds(args[0], offset)
		if err != nil {
			return nil, err
		}
		return FormatDate(seconds, format, offset), nil
	}},
	"now": {0, 0, func(_ []value.Value, ctx Context) (value.Value, error) {
		return ctx.Env.Now, nil
	}},
}
