package generated

import "encoding/json"

func generatedDecode(input any, output any) error {
	data, err := json.Marshal(generatedPlain(input))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, output)
}
