import styled from "styled-components/native";

// The flag of Bénin: a green hoist band, then yellow over red.
//
// Drawn, not shipped as an image — three rectangles cost less than a PNG and
// stay sharp at any density. The proportions are the real ones: 3:2 overall,
// the green band two fifths of the length, expressed as flex 2 against 3 so
// it holds at whatever size a caller asks for. A national flag drawn
// approximately is worse than no flag.
//
// It sits on a white plate. Every banner in this app is a saturated green
// gradient, and the flag's own green (#008751) is close enough to those that
// a hairline was not enough to separate them — the hoist band sank into the
// background and what was left read as two stripes floating in space. White
// behind it is how a flag sits against its pole rather than against the sky.
//
// Where it belongs: banners that claim the country. Immobilier, Véhicules,
// Restaurants and Local all say "au Bénin" in the line beside it, and the
// flag is that claim in one glyph. It is not decoration to sprinkle on every
// hero — a flag on "Climatisation" says nothing, and a mark that appears
// everywhere stops meaning anything.
export function BeninFlag({ width = 30 }) {
  const height = Math.round((width / 3) * 2);
  return (
    <Plate>
      <Flag style={{ width, height }}>
        <Green />
        <Fly>
          <Yellow />
          <Red />
        </Fly>
      </Flag>
    </Plate>
  );
}

const Plate = styled.View`
  padding: 2.5px;
  border-radius: 6px;
  background-color: #ffffff;
`;

const Flag = styled.View`
  flex-direction: row;
  border-radius: 3.5px;
  overflow: hidden;
`;

const Green = styled.View`
  flex: 2;
  background-color: #008751;
`;

const Fly = styled.View`
  flex: 3;
`;

const Yellow = styled.View`
  flex: 1;
  background-color: #fcd116;
`;

const Red = styled.View`
  flex: 1;
  background-color: #e8112d;
`;
