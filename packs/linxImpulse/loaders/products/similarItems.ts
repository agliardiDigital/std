import type { Product } from "deco-sites/std/commerce/types.ts";
import type {
  PagesRecommendationsResponse,
  Position,
  SearchProductsResponse,
} from "deco-sites/std/packs/linxImpulse/types.ts";

import type { Context } from "deco-sites/std/packs/linxImpulse/accounts/linxImpulse.ts";
import { paths } from "deco-sites/std/packs/linxImpulse/utils/path.ts";
import {
  toProduct,
  toProductLinxImpulse,
  toRequestHeader,
} from "deco-sites/std/packs/linxImpulse/utils/transform.ts";
import { HttpError } from "deco-sites/std/utils/HttpError.ts";
import { fetchAPI } from "deco-sites/std/utils/fetch.ts";

export interface Props {
  /**
   * @title Position
   */
  position: Position;

  /**
   * @title Feature
   */
  feature: "SimilarItems" | "FrequentlyBoughtTogether";
}

/**
 * @title Linx Impulse - Product SimilarItems
 * @description Use it in Shelves on Product Page
 */
const loader = async (
  props: Props,
  req: Request,
  ctx: Context,
): Promise<Product[] | null> => {
  const { configLinxImpulse: config } = ctx;
  const { position, feature } = props;
  const url = new URL(req.url);
  const skuId = url.searchParams.get("skuId");
  const requestHeaders = toRequestHeader(config!);

  /**
   * As the Linx APIs do not support slug searches, we need to get the product reference that every product has on URL
   */
  const regex = /-(\d+)\/p/;
  const match = url.pathname.match(regex);

  if (!match) return null;

  try {
    const linxImpulse = paths(config!);
    const { products: productsBySlug } = await fetchAPI<SearchProductsResponse>(
      `${linxImpulse.product.getProductBySlug.term(match[1])}`,
      { headers: requestHeaders },
    );

    const product = productsBySlug.find((product) => {
      return product.skus.some((sku) => sku.sku === skuId);
    });

    if (!product?.id) return null;

    const recommendationsResponse = await fetchAPI<
      PagesRecommendationsResponse
    >(
      `${linxImpulse.product.similarItems.productId(product.id)}`,
      { headers: requestHeaders },
    );
    let shelfs;

    if (position) {
      shelfs = recommendationsResponse[position];
    }

    if (feature) {
      shelfs = shelfs?.filter((shelf) => shelf.feature === feature);
    }

    if (!shelfs) return null;

    const options = {
      baseUrl: req.url,
    };

    const products = shelfs
      .flatMap((shelf) =>
        shelf.displays[0]?.recommendations.map((productRecommendation) => {
          const product = toProductLinxImpulse(
            productRecommendation,
            productRecommendation.skus[0],
          );
          return toProduct(product, product.skus[0].properties, 0, options);
        })
      );

    return products;
  } catch (err) {
    if (err instanceof HttpError && err.status >= 500) {
      throw err;
    }
    return null;
  }
};

export default loader;
