import React, { FunctionComponent } from "react";
import { Box } from "../../../../components/box";
import { ColorPalette } from "../../../../styles";
import { Column, Columns } from "../../../../components/column";
import { Stack } from "../../../../components/stack";
import { Body3, Subtitle2 } from "../../../../components/typography";
import { Button } from "../../../../components/button";
import { useNavigate } from "react-router";
import { useTheme } from "styled-components";

export const PrivacyShieldView: FunctionComponent = () => {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box
      backgroundColor={
        theme.mode === "light" ? ColorPalette.white : ColorPalette["gray-650"]
      }
      borderRadius="0.375rem"
      padding="1rem"
      style={{
        boxShadow:
          theme.mode === "light"
            ? "0px 1px 4px 0px rgba(43, 39, 55, 0.10)"
            : "none",
      }}
    >
      <Columns sum={1} alignY="center">
        <Stack gutter="0.5rem">
          <Subtitle2
            color={
              theme.mode === "light"
                ? ColorPalette["gray-700"]
                : ColorPalette["gray-10"]
            }
          >
            Privacy
          </Subtitle2>

          <Body3 color={ColorPalette["gray-300"]}>
            Shield or unshield your CLAW tokens
          </Body3>
        </Stack>

        <Column weight={1} />

        <Button
          color="secondary"
          text="Shield"
          size="small"
          onClick={() => {
            navigate("/privacy");
          }}
          buttonStyle={{
            borderRadius: "1.3125rem",
            padding: "0.5rem 1rem",
          }}
        />
      </Columns>
    </Box>
  );
};
